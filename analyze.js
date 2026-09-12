/* Анализ данных экспорта TikTok (порт analyze.py). Чистые функции без DOM. */
(function (root) {
  'use strict';

  var NO_DATA = 'В этом разделе нет данных';
  var SELF = 'svinorez99';

  /* ---------- helpers ---------- */

  function escRe(name) {
    return name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function textOf(files, name) {
    // ищем файл по имени (конец полного пути), берём первый попавшийся
    var re = new RegExp(escRe(name) + '$');
    for (var p of files.keys()) {
      if (p[p.length - 1] !== '/' && re.test(p)) return files.get(p);
    }
    return '';
  }

  function hasData(files, name) {
    var t = textOf(files, name);
    return !!t && t.indexOf(NO_DATA) === -1;
  }

  function parseBlocks(text) {
    var blocks = [], cur = null;
    text.split(/\r?\n/).forEach(function (line) {
      if (!line.trim()) { if (cur) { blocks.push(cur); cur = null; } return; }
      var i = line.indexOf(':');
      if (i >= 0) {
        if (!cur) cur = {};
        cur[line.slice(0, i).trim()] = line.slice(i + 1).trim();
      }
    });
    if (cur) blocks.push(cur);
    return blocks;
  }

  function parseDate(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(String(s || ''));
    if (!m) return null;
    return { y: +m[1], mo: +m[2], d: +m[3], h: +m[4],
             key: m[1] + '-' + m[2] + '-' + m[3], month: m[1] + '-' + m[2] };
  }

  function weekdayIdx(dt) { return new Date(Date.UTC(dt.y, dt.mo - 1, dt.d)).getUTCDay(); }

  function parseMessages(text) {
    var chats = {}, order = [];
    var current = null;
    var headerRe = /^>>> Chat History with (.+?)::\s*$/;
    var msgRe = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) UTC (.+)$/;
    text.split(/\r?\n/).forEach(function (line) {
      if (!line.trim()) return;
      var m = headerRe.exec(line);
      if (m) {
        current = m[1].trim();
        if (!chats[current]) { chats[current] = []; order.push(current); }
        return;
      }
      if (!current) return;
      m = msgRe.exec(line);
      if (m) {
        var rest = m[2], ci = rest.indexOf(': ');
        var author = ci >= 0 ? rest.slice(0, ci).trim() : rest.trim();
        var text = ci >= 0 ? rest.slice(ci + 2) : '';
        chats[current].push({ date: m[1], author: author, text: text });
      }
    });
    return { chats: chats, order: order };
  }

  function videoId(link) {
    var m = /\/video\/(\d+)/.exec(String(link || ''));
    return m ? m[1] : link;
  }

  function two(x) { return (x < 10 ? '0' : '') + x; }

  function dayDiff(b, a) {
    var A = +new Date(a + 'T00:00:00Z'), B = +new Date(b + 'T00:00:00Z');
    return Math.round((B - A) / 86400000);
  }

  /* ---------- заглушка для теста в Node ---------- */
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      textOf: textOf, hasData: hasData, parseBlocks: parseBlocks,
      parseDate: parseDate, parseMessages: parseMessages, videoId: videoId, NO_DATA: NO_DATA
    };
  }

  /* ---------- анализ ---------- */

  function analyze(files) {
    var profile = textOf(files, 'Данные профиля.txt');
    profile.split(/\r?\n/).forEach(function (line) {
      if (line.indexOf('Имя пользователя:') === 0) {
        var v = line.slice(line.indexOf(':') + 1).trim();
        if (v) SELF = v;
      }
    });

    var sections = [];
    function section(title) { var s = { title: title, items: [] }; sections.push(s); return s.items; }
    function add(items, kind, extra) { var o = { kind: kind }; for (var k in extra) o[k] = extra[k]; items.push(o); }

    // ---------- Профиль ----------
    (function () {
      var items = section('Профиль');
      var keep = { 'Имя пользователя': 1, 'Никнейм': 1, 'Адрес электронной почты': 1,
        'Регион аккаунта': 1, 'Дата рождения': 1, 'Количество подписчиков': 1, 'Количество подписок': 1 };
      var pairs = [], settings = [];
      var stop = false;
      profile.split(/\r?\n/).forEach(function (line) {
        if (stop) return;
        var i = line.indexOf(':');
        if (i >= 0) {
          var k = line.slice(0, i).trim(), v = line.slice(i + 1).trim();
          if (k === 'Подключение сторонних сервисов') { stop = true; return; }
          if (keep[k] && v && v !== 'None' && v !== 'N/A') pairs.push([k, v]);
        } else if (line.trim().indexOf('Подключение') === 0) { stop = true; }
      });
      if (pairs.length) add(items, 'keys', { pairs: pairs });
      var s = textOf(files, 'Настройки.txt');
      s.split(/\r?\n/).forEach(function (line) {
        var i = line.indexOf(':');
        if (i >= 0) {
          var k = line.slice(0, i).trim(), v = line.slice(i + 1).trim();
          if (k && v) settings.push([k, v]);
        }
      });
      if (settings.length) add(items, 'chips', { pairs: settings, title: 'Настройки аккаунта' });
    })();

    // ---------- Сообщения ----------
    var chatsData = parseMessages(textOf(files, 'Личные сообщения.txt'));
    var chats = {}, order = [];
    for (var n in chatsData.chats) {
      chats[n] = chatsData.chats[n]; order.push(n);
    }

    var summary = {};
    (function () {
      var items = section('Личные сообщения');
      if (!order.length) { add(items, 'text', { text: 'Нет сообщений' }); return; }

      var total = 0, sent = 0;
      order.forEach(function (nm) {
        total += chats[nm].length;
        sent += chats[nm].filter(function (m) { return m.author === SELF; }).length;
      });
      var recv = total - sent;
      var video = 0;
      order.forEach(function (nm) {
        video += chats[nm].filter(function (m) { return m.text.indexOf('https://www.tiktokv.com/share/video/') === 0; }).length;
      });
      var textMsgs = total - video;

      summary.messages = total; summary.chats = order.length;
      summary.sent = sent; summary.recv = recv;

      add(items, 'cards', { cards: [
        ['Всего сообщений', total, order.length + ' чатов'],
        ['Отправлено тобой', sent, (100 * sent / total).toFixed(1) + '%'],
        ['Получено', recv, (100 * recv / total).toFixed(1) + '%'],
        ['Сообщения-видео', video, (100 * video / total).toFixed(1) + '%'],
        ['Текстовые сообщения', textMsgs, (100 * textMsgs / total).toFixed(1) + '%']
      ] });

      var rows = [], active = [];
      order.forEach(function (nm) {
        var msgs = chats[nm];
        var s = msgs.filter(function (m) { return m.author === SELF; }).length;
        var dates = msgs.map(function (m) { return parseDate(m.date); }).filter(Boolean)
          .sort(function (a, b) { return a.key < b.key ? -1 : 1; });
        var first = dates[0], last = dates[dates.length - 1];
        var span = dates.length ? dayDiff(last.key, first.key) + 1 : 0;
        rows.push([nm, msgs.length, s, msgs.length - s, first.key, last.key, span]);
        if (last.key >= '2026-09-01') active.push([nm, msgs.length]);
      });
      rows.sort(function (a, b) { return b[1] - a[1]; });
      active.sort(function (a, b) { return b[1] - a[1]; });

      add(items, 'table', { headers: ['Чат', 'Всего', 'Ты', 'Тебе', 'Первое', 'Последнее', 'Дней общения'],
        rows: rows, title: 'Все чаты (по количеству сообщений)', row: true });

      var myTop = order.map(function (nm) {
        return [nm, chats[nm].filter(function (m) { return m.author === SELF; }).length];
      }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 10);
      var theirTop = order.map(function (nm) {
        return [nm, chats[nm].filter(function (m) { return m.author !== SELF; }).length];
      }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 10);

      add(items, 'twotables', {
        headers1: ['Чат', 'Ты написал'], rows1: myTop, title1: 'Где ты писал больше всего',
        headers2: ['Чат', 'Тебе написали'], rows2: theirTop, title2: 'Откуда тебе писали больше всего',
        row: true
      });

      add(items, 'bars', { labels: rows.slice(0, 12).map(function (r) { return r[0]; }),
        values: rows.slice(0, 12).map(function (r) { return r[1]; }),
        title: 'Топ-12 чатов по сообщениям' });

      var hours = {}, weekdays = {}, days = {}, months = {};
      order.forEach(function (nm) {
        chats[nm].forEach(function (m) {
          var dt = parseDate(m.date);
          if (!dt) return;
          hours[dt.h] = (hours[dt.h] || 0) + 1;
          weekdays[weekdayIdx(dt)] = (weekdays[weekdayIdx(dt)] || 0) + 1;
          days[dt.key] = (days[dt.key] || 0) + 1;
          months[dt.month] = (months[dt.month] || 0) + 1;
        });
      });

      var mxh = 0; for (var h in hours) if (hours[h] > mxh) mxh = hours[h];
      add(items, 'bars', { labels: Array.from({ length: 24 }, function (_, i) { return two(i) + ':00'; }),
        values: Array.from({ length: 24 }, function (_, i) { return hours[i] || 0; }),
        pct: Array.from({ length: 24 }, function (_, i) { return (hours[i] || 0) * 100 / (mxh || 1); }),
        title: 'Активность по часам суток (UTC)' });

      var wd = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
      var dex = {}; for (var i = 0; i < 7; i++) dex[(i + 1) % 7] = wd[i]; // Пн=0 -> JS getUTCDay Пн=1
      var wdLabels = [], wdVals = [];
      for (var d = 0; d < 7; d++) { wdLabels.push(wd[d]); wdVals.push(weekdays[(d + 1) % 7] || 0); }
      add(items, 'bars', { labels: wdLabels, values: wdVals, title: 'Активность по дням недели' });

      var mKeys = Object.keys(months).sort();
      add(items, 'bars', { labels: mKeys, values: mKeys.map(function (m) { return months[m]; }),
        title: 'Динамика сообщений по месяцам' });

      var dayRows = Object.keys(days).map(function (k) { return [k, days[k]]; })
        .sort(function (a, b) { return b[1] - a[1]; }).slice(0, 10);
      add(items, 'table', { headers: ['Дата', 'Сообщений'], rows: dayRows, title: 'Самые активные дни' });

      var dayKeys = Object.keys(days).sort();
      var streak = 1, best = 1;
      for (var i2 = 1; i2 < dayKeys.length; i2++) {
        streak = dayDiff(dayKeys[i2], dayKeys[i2 - 1]) === 1 ? streak + 1 : 1;
        if (streak > best) best = streak;
      }
      var totalDays = dayKeys.length ? dayDiff(dayKeys[dayKeys.length - 1], dayKeys[0]) + 1 : 0;
      add(items, 'keys', { pairs: [
        ['Период переписки', dayKeys.length ? dayKeys[0] + ' .. ' + dayKeys[dayKeys.length - 1] : '-'],
        ['Дней в общей переписке', String(totalDays)],
        ['Максимальный непрерывный streak активных дней', String(best)],
        ['Активны в сент. 2026', active.map(function (a) { return a[0] + ' (' + a[1] + ')'; }).join(', ') || '-'],
        ['Часовой пояс сообщений', 'UTC']
      ] });
    })();

    // ---------- Tako ----------
    (function () {
      var items = section('TikTok Tako (ИИ-ассистент)');
      var t = textOf(files, 'История чата Tako.txt');
      if (t && t.indexOf(NO_DATA) === -1) {
        var cnt = t.split(/\r?\n/).filter(function (l) { return l.indexOf('[') === 0; }).length;
        add(items, 'keys', { pairs: [['Записей в чате', String(cnt)]] });
      } else add(items, 'text', { text: 'Нет данных' });
    })();

    // ---------- Комментарии ----------
    (function () {
      var items = section('Комментарии');
      var t = textOf(files, 'Комментарии.txt');
      if (!t || t.indexOf(NO_DATA) !== -1) { add(items, 'text', { text: 'Нет данных' }); return; }
      var blocks = parseBlocks(t);
      var texts = blocks.filter(function (b) { return b['Комментарий'] && b['Комментарий'] !== 'N/A'; })
        .map(function (b) { return b['Комментарий']; });
      var byAuthor = {}, hours = {};
      blocks.forEach(function (b) {
        var m = /@(\d+)/.exec(b['Ссылка на исходную публикацию'] || '');
        var a = m ? m[1] : '-';
        byAuthor[a] = (byAuthor[a] || 0) + 1;
        var dt = parseDate(b['Дата']);
        if (dt) hours[dt.h] = (hours[dt.h] || 0) + 1;
      });
      var avg = texts.length ? Math.round(texts.reduce(function (s, x) { return s + x.length; }, 0) / texts.length) : 0;
      add(items, 'cards', { cards: [
        ['Комментариев', blocks.length, 'всего'],
        ['С текстом', texts.length, Math.round(100 * texts.length / Math.max(1, blocks.length)) + '%'],
        ['Средняя длина', avg, 'символов']
      ] });
      if (Object.keys(byAuthor).length) {
        add(items, 'table', { headers: ['Автор видео', 'Комментариев'],
          rows: topPairs(byAuthor, 10), title: 'Топ авторов, под которыми ты комментировал' });
      }
      var mxh = 0; for (var h in hours) if (hours[h] > mxh) mxh = hours[h];
      add(items, 'bars', { labels: Array.from({ length: 24 }, function (_, i) { return two(i) + ':00'; }),
        values: Array.from({ length: 24 }, function (_, i) { return hours[i] || 0; }),
        pct: Array.from({ length: 24 }, function (_, i) { return (hours[i] || 0) * 100 / (mxh || 1); }),
        title: 'Комментарии по часам (UTC)' });
      add(items, 'list', { entries: texts.slice(0, 8), title: 'Примеры твоих комментариев' });
    })();

    function topPairs(obj, n) {
      return Object.keys(obj).map(function (k) { return [k, obj[k]]; })
        .sort(function (a, b) { return b[1] - a[1]; }).slice(0, n);
    }

    // ---------- Лайки / Избранные ----------
    function countVideoDays(text) {
      var blocks = parseBlocks(text), days = {}, uniq = {}, n = 0;
      blocks.forEach(function (b) {
        var m = /\/video\/(\d+)/.exec(b['Ссылка'] || '');
        if (!m) return;
        n++;
        uniq[m[1]] = 1;
        var dt = parseDate(b['Дата']);
        if (dt) days[dt.key] = (days[dt.key] || 0) + 1;
      });
      return { n: blocks.length, uniq: Object.keys(uniq).length, days: days, blocks: blocks };
    }

    function addLikeSection(title, fileName) {
      var items = section(title);
      var t = textOf(files, fileName);
      if (!t || t.indexOf(NO_DATA) !== -1) { add(items, 'text', { text: 'Нет данных' }); return; }
      var st = countVideoDays(t);
      add(items, 'cards', { cards: [
        [title, st.blocks.length, 'записей'],
        ['Уникальных видео', st.uniq, st.blocks.length ? Math.round(100 * st.uniq / st.blocks.length) + '%' : ''],
        ['Активных дней', Object.keys(st.days).length, '']
      ] });
      add(items, 'table', { headers: ['Дата', 'Кол-во'],
        rows: topPairs(st.days, 10), title: 'Топ дней' });
      return st;
    }

    var likes = addLikeSection('Лайки', 'Список лайков.txt');
    var favs = addLikeSection('Избранные видео', 'Избранные видео.txt');
    if (likes) summary.likes = likes.blocks.length;
    if (favs) summary.favs = favs.blocks.length;

    (function () {
      var items = section('Избранное (другое)');
      var pairs = [
        ['звуки', 'Избранные звуки.txt'], ['хэштеги', 'Избранные хэштеги.txt'],
        ['плейлисты', 'Избранные плейлисты.txt'], ['эффекты', 'Избранные эффекты.txt'],
        ['коллекции', 'Избранные коллекции.txt'], ['места', 'Избранные места.txt'],
        ['фильмы и сериалы', 'Избранные фильмы и сериалы.txt']
      ];
      add(items, 'keys', { pairs: pairs.map(function (p) {
        return [p[0], hasData(files, p[1]) ? 'есть данные' : 'нет данных'];
      }) });
    })();

    // ---------- История просмотра ----------
    (function () {
      var items = section('История просмотра видео');
      var t = textOf(files, 'История просмотра.txt');
      var blocks = parseBlocks(t);
      var days = {}, uniq = {}, perday = {}, months = {}, n = 0;
      blocks.forEach(function (b) {
        var m = /\/video\/(\d+)/.exec(b['Ссылка'] || '');
        if (!m) return;
        n++;
        uniq[m[1]] = 1;
        var dt = parseDate(b['Дата']);
        if (dt) {
          days[dt.key] = (days[dt.key] || 0) + 1;
          if (!perday[dt.key]) perday[dt.key] = {};
          perday[dt.key][m[1]] = 1;
          months[dt.month] = (months[dt.month] || 0) + 1;
        }
      });
      var mn = Object.keys(days).length;
      var peak = null, peakV = 0;
      for (var d in perday) { var v = Object.keys(perday[d]).length; if (v > peakV) { peakV = v; peak = d; } }
      var first = Object.keys(days).sort()[0], last = Object.keys(days).sort().slice(-1)[0];
      add(items, 'cards', { cards: [
        ['Просмотров записано', n, first ? 'период ' + first + '..' + last : ''],
        ['Уникальных видео', Object.keys(uniq).length, n ? Math.round(100 * Object.keys(uniq).length / n) + '%' : ''],
        ['Повторных просмотров', n - Object.keys(uniq).length, ''],
        ['Активных дней', mn, '']
      ] });
      if (mn) {
        add(items, 'keys', { pairs: [
          ['Средне в день', (n / mn).toFixed(1)],
          ['День с максимумом видео', peak ? peak + ' (' + peakV + ' разных)' : '-']
        ] });
      }
      var mKeys = Object.keys(months).sort();
      add(items, 'bars', { labels: mKeys, values: mKeys.map(function (m) { return months[m]; }),
        title: 'Просмотры по месяцам' });
      add(items, 'table', { headers: ['Дата', 'Просмотров'], rows: topPairs(days, 10),
        title: 'Топ дней по просмотрам' });
      summary.views = n; summary.viewsUnique = Object.keys(uniq).length;
    })();

    // ---------- Репосты ----------
    (function () {
      var items = section('Репосты и пересылки');
      var t = textOf(files, 'История репостов.txt');
      if (!t || t.indexOf(NO_DATA) !== -1) { add(items, 'text', { text: 'Нет данных' }); return; }
      var blocks = parseBlocks(t);
      var byMethod = {}, byType = {};
      blocks.forEach(function (b) {
        var m = b['Метод'] || '?', tp = b['Пересланный контент'] || '?';
        byMethod[m] = (byMethod[m] || 0) + 1;
        byType[tp] = (byType[tp] || 0) + 1;
      });
      add(items, 'cards', { cards: [['Репостов', blocks.length, 'за всё время']] });
      add(items, 'table', { headers: ['Метод', 'Кол-во'], rows: topPairs(byMethod), title: 'Как пересылал (метод)' });
      add(items, 'table', { headers: ['Тип контента', 'Кол-во'], rows: topPairs(byType), title: 'Что пересылал' });
    })();

    // ---------- Стикеры ----------
    (function () {
      var items = section('Стикеры');
      var t = textOf(files, 'Стикеры.txt');
      if (t && t.indexOf(NO_DATA) === -1) {
        add(items, 'keys', { pairs: [['Создано стикеров', String(parseBlocks(t).length)]] });
      } else add(items, 'text', { text: 'Нет данных' });
    })();

    // ---------- Соцграф ----------
    (function () {
      var items = section('Социальный граф');
      function names(fileName) {
        return parseBlocks(textOf(files, fileName))
          .map(function (b) { return b['Имя пользователя']; })
          .filter(Boolean);
      }
      var foll = names('Подписчик.txt'), folling = names('Подписки.txt');
      var viewers = names('Просмотры профиля.txt'), blocked = names('Список блокировки.txt');
      var fs = {}, fg = {};
      foll.forEach(function (u) { fs[u] = 1; });
      folling.forEach(function (u) { fg[u] = 1; });
      var mutual = Object.keys(fs).filter(function (u) { return fg[u]; }).sort();
      var chatNames = {};
      order.forEach(function (nm) { if (nm !== SELF) chatNames[nm] = 1; });

      add(items, 'cards', { cards: [
        ['Подписчиков', foll.length, mutual.length ? 'взаимных: ' + mutual.length : ''],
        ['Подписок', folling.length, ''],
        ['Кто смотрел профиль', viewers.length, ''],
        ['Заблокировано', blocked.length, '']
      ] });
      if (mutual.length) add(items, 'list', { entries: mutual, title: 'Взаимные подписки' });

      var rel = [];
      mutual.forEach(function (u) { rel.push([u, 'взаимная подписка']); });
      Object.keys(fs).filter(function (u) { return !fg[u]; }).sort().forEach(function (u) { rel.push([u, 'подписчик']); });
      Object.keys(fg).filter(function (u) { return !fs[u]; }).sort().forEach(function (u) { rel.push([u, 'подписка']); });
      add(items, 'table', { headers: ['Пользователь', 'Статус'], rows: rel, title: 'Взаимосвязи' });

      var withSubs = Object.keys(chatNames).filter(function (u) { return fs[u]; }).sort().join(', ');
      var withFoll = Object.keys(chatNames).filter(function (u) { return fg[u]; }).sort().join(', ');
      add(items, 'keys', { pairs: [
        ['Общаешься с подписчиками', withSubs || 'нет'],
        ['Общаешься с теми, на кого подписан', withFoll || 'нет'],
        ['Заблокированные', blocked.join(', ') || 'нет']
      ] });
      summary.followers = foll.length; summary.following = folling.length;
    })();

    // ---------- Поиск ----------
    (function () {
      var items = section('Поисковые запросы');
      var t = textOf(files, 'Поисковые запросы.txt');
      if (!t || t.indexOf(NO_DATA) !== -1) { add(items, 'text', { text: 'Нет данных' }); return; }
      var queries = parseBlocks(t).map(function (b) { return b['Поисковый запрос']; }).filter(Boolean);
      var words = {};
      queries.forEach(function (q) {
        (q.toLowerCase().match(/[а-яёa-z0-9]+/g) || []).forEach(function (w) { words[w] = (words[w] || 0) + 1; });
      });
      add(items, 'cards', { cards: [['Запросов', queries.length, 'всего']] });
      add(items, 'table', { headers: ['Слово', 'Раз'], rows: topPairs(words, 15),
        title: 'Частые слова в запросах' });
      var longest = queries.slice().sort(function (a, b) { return b.length - a.length; }).slice(0, 10);
      add(items, 'list', { entries: longest, title: 'Самые длинные запросы' });
    })();

    // ---------- Входы ----------
    (function () {
      var items = section('Входы в аккаунт');
      var blocks = parseBlocks(textOf(files, 'История входов.txt'));
      if (!blocks.length) { add(items, 'text', { text: 'Нет данных' }); return; }
      var ips = {}, models = {}, days = {}, months = {}, dates = [];
      blocks.forEach(function (b) {
        var ip = b['IP-адрес'] || '-', mo = b['Модель устройства'] || '-';
        ips[ip] = (ips[ip] || 0) + 1;
        models[mo] = (models[mo] || 0) + 1;
        var dt = parseDate(b['Дата']);
        if (dt) { days[dt.key] = (days[dt.key] || 0) + 1; months[dt.month] = (months[dt.month] || 0) + 1; dates.push(dt); }
      });
      dates.sort(function (a, b) { return a.key < b.key ? -1 : 1; });
      add(items, 'cards', { cards: [
        ['Входов', blocks.length, ''],
        ['Уникальных IP', Object.keys(ips).length, ''],
        ['Первый вход', dates.length ? dates[0].key + ' ' + two(dates[0].h) + ':' + two(dates[0].min) : '', ''],
        ['Последний вход', dates.length ? dates[dates.length - 1].key + ' ' + two(dates[dates.length - 1].h) + ':' + two(dates[dates.length - 1].min) : '', '']
      ] });
      add(items, 'table', { headers: ['Устройство', 'Входов'], rows: topPairs(models), title: 'Устройства' });
      add(items, 'keys', { pairs: [['Топ IP', topPairs(ips, 5).map(function (p) { return p[0] + ' — ' + p[1]; }).join(', ')]] });
      var mKeys = Object.keys(months).sort();
      add(items, 'bars', { labels: mKeys, values: mKeys.map(function (m) { return months[m]; }),
        title: 'Входы по месяцам' });
      add(items, 'table', { headers: ['Дата', 'Входов'], rows: topPairs(days, 10), title: 'Топ дней по входам' });
      summary.logins = blocks.length;
    })();

    // ---------- Подарки ----------
    (function () {
      var items = section('Подарки и покупки подарков');
      var t = textOf(files, 'Покупки.txt');
      var sectionName = '', sent = 0, sentSum = 0, bought = 0, boughtSum = 0;
      t.split(/\r?\n/).forEach(function (line) {
        var s = line.trim();
        if (s.indexOf('История отправки Подарков') === 0) sectionName = 'sent';
        else if (s.indexOf('История покупки Подарков') === 0) sectionName = 'bought';
        var m = /^Цена:\s*([\d.]+)/.exec(s);
        if (m) {
          var v = parseFloat(m[1]);
          if (sectionName === 'sent') { sent++; sentSum += v; } else { bought++; boughtSum += v; }
        }
      });
      if (!t.trim()) add(items, 'text', { text: 'Нет данных' });
      else add(items, 'keys', { pairs: [
        ['Отправлено подарков', sent + ' (сумма ' + sentSum.toFixed(2) + ')'],
        ['Куплено подарков', bought + ' (сумма ' + boughtSum.toFixed(2) + ')']
      ] });
    })();

    // ---------- TikTok Shop ----------
    (function () {
      var items = section('TikTok Shop');
      var t = textOf(files, 'История просмотра товаров.txt');
      if (t && t.indexOf(NO_DATA) === -1) {
        var blocks = parseBlocks(t);
        var shops = {}, products = {};
        blocks.forEach(function (b) {
          var sh = b['Название магазина'] || '-', pr = b['Название товара'] || '-';
          shops[sh] = (shops[sh] || 0) + 1;
          products[pr] = (products[pr] || 0) + 1;
        });
        add(items, 'cards', { cards: [['Просмотрено товаров', blocks.length, '']] });
        add(items, 'table', { headers: ['Магазин', 'Просмотров'], rows: topPairs(shops, 10), title: 'Топ магазинов' });
        add(items, 'table', { headers: ['Товар', 'Просмотров'], rows: topPairs(products, 10), title: 'Топ товаров' });
      } else add(items, 'text', { text: 'Нет просмотров товаров' });
      var empty = [];
      ['История заказов.txt', 'История возвратов.txt', 'История споров по заказам.txt',
       'Отзывы о товарах.txt', 'Ваучеры.txt', 'История взаимодействия со службой поддержки.txt',
       'Коммуникация с магазинами.txt', 'Список товаров в корзине.txt'].forEach(function (f) {
        if (!hasData(files, f)) empty.push(f);
      });
      add(items, 'keys', { pairs: [['Нет данных в разделе', empty.join(', ') || '—']] });
    })();

    // ---------- Пустые разделы ----------
    (function () {
      var items = section('Разделы без данных');
      var empty = [];
      [['Публикации', 'Публикации.txt'], ['Публикации', 'Недавно удаленные публикации.txt'],
       ['Групповой чат', 'Групповой чат.txt'], ['Трансляции в TikTok', 'История выходов в эфир.txt'],
       ['Трансляции в TikTok', 'Комментарий к трансляции.txt'], ['Отзывы о местах', 'Отзывы о местах.txt'],
       ['Кошелек Income+', 'История транзакций.txt'], ['Ваша активность', 'Хэштег.txt'],
       ['Ваша активность', 'Пожертвование.txt'], ['Ваша активность', 'Активность вне TikTok.txt']]
        .forEach(function (p) { if (!hasData(files, p[1])) empty.push(p[0] + '/' + p[1]); });
      add(items, 'list', { entries: empty, title: 'Пустые разделы' });
    })();

    // ---------- заголовок ----------
    var summaryCards = [
      ['Всего сообщений', summary.messages || 0, (summary.chats || 0) + ' чатов'],
      ['Лайков', summary.likes || 0, ''],
      ['Избранные видео', summary.favs || 0, ''],
      ['Просмотров видео', summary.views || 0, 'уник. ' + (summary.viewsUnique || 0)],
      ['Подписчиков', summary.followers || 0, 'подписок: ' + (summary.following || 0)],
      ['Входов', summary.logins || 0, '']
    ];

    return { ok: true, self: SELF, sections: sections, summaryCards: summaryCards };
  }

  root.TikTokAnalyzer = { analyze: analyze };
})(typeof window !== 'undefined' ? window : globalThis);