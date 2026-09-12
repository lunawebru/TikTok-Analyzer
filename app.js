/* Рендер отчёта на страницу */
(function () {
  'use strict';

  var drop = document.getElementById('drop');
  var fileInput = document.getElementById('file');
  var statusEl = document.getElementById('status');
  var reportEl = document.getElementById('report');
  var summaryEl = document.getElementById('summary');

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function setStatus(msg, ok) {
    statusEl.hidden = false;
    statusEl.textContent = msg;
    statusEl.className = 'status ' + (ok ? 'ok' : 'err');
  }

  /* ---------- builders ---------- */

  function cardsHTML(cards) {
    return '<div class="cards">' + cards.map(function (c, i) {
      return '<div class="card" style="animation-delay:' + (i * 70) + 'ms">' +
             '<div class="cnum">' + esc(c[1]) + '</div>' +
             '<div class="clabel">' + esc(c[0]) + '</div>' +
             '<div class="cnote">' + esc(c[2] || '') + '</div></div>';
    }).join('') + '</div>';
  }

  function tblHTML(headers, rows) {
    var head = headers.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('');
    var body = rows.map(function (r, i) {
      return '<tr style="animation-delay:' + (i * 35) + 'ms">' +
             r.map(function (c) { return '<td>' + esc(c) + '</td>'; }).join('') + '</tr>';
    }).join('');
    return '<div class="tblwrap"><table><thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody></table></div>';
  }

  function barsHTML(labels, values, pct) {
    var mx = 1;
    values.forEach(function (v) { if (v > mx) mx = v; });
    var bars = labels.map(function (l, i) {
      var p = pct ? pct[i] : (values[i] * 100 / mx);
      var d = (i * 45) + 'ms';
      return '<div class="brow" style="animation-delay:' + d + '">' +
             '<div class="blab">' + esc(l) + '</div>' +
             '<div class="btrack"><div class="bfill" style="animation-delay:' + d + ';width:' + p.toFixed(1) + '%"></div></div>' +
             '<div class="bval">' + esc(values[i]) + '</div></div>';
    }).join('');
    return '<div class="bars">' + bars + '</div>';
  }

  function kvHTML(pairs) {
    var rows = pairs.map(function (p, i) {
      return '<tr style="animation-delay:' + (i * 25) + 'ms"><td>' + esc(p[0]) + '</td><td>' + esc(p[1]) + '</td></tr>';
    }).join('');
    return '<div class="tblwrap"><table class="kv">' + rows + '</table></div>';
  }

  function chipsHTML(pairs) {
    var chips = pairs.map(function (p, i) {
      return '<span class="chip" style="animation-delay:' + (i * 30) + 'ms"><b>' + esc(p[0]) + '</b>: ' + esc(p[1]) + '</span>';
    }).join('');
    return '<div class="chips">' + chips + '</div>';
  }

  function listHTML(items, title) {
    var t = title ? '<h3>' + esc(title) + '</h3>' : '';
    return t + '<ul>' + items.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>';
  }

  function renderItem(it) {
    var k = it.kind;
    if (k === 'keys') {
      var t = it.title ? '<h3>' + esc(it.title) + '</h3>' : '';
      return t + kvHTML(it.pairs);
    }
    if (k === 'chips') {
      return (it.title ? '<h3>' + esc(it.title) + '</h3>' : '') + chipsHTML(it.pairs);
    }
    if (k === 'twotables') {
      return '<div class="cards3 two">' +
             tblHTML(it.headers1, it.rows1) + tblHTML(it.headers2, it.rows2) + '</div>';
    }
    if (k === 'table') {
      return (it.title ? '<h3>' + esc(it.title) + '</h3>' : '') + tblHTML(it.headers, it.rows);
    }
    if (k === 'bars') {
      return (it.title ? '<h3>' + esc(it.title) + '</h3>' : '') +
             barsHTML(it.labels, it.values, it.pct);
    }
    if (k === 'list') {
      return listHTML(it.entries, it.title);
    }
    if (k === 'text') {
      return '<div class="empty">' + esc(it.text) + '</div>';
    }
    return '';
  }

  function renderSections(rootEl, sections) {
    rootEl.innerHTML = sections.map(function (sec) {
      var inner = [];
      var row = [];
      function flush() {
        if (row.length) {
          inner.push('<div class="cards3 row">' + row.join('') + '</div>');
          row = [];
        }
      }
      sec.items.forEach(function (it) {
        var h = renderItem(it);
        if (it.row) { row.push(h); } else { flush(); inner.push(h); }
      });
      flush();
      return '<section><h2>' + esc(sec.title) + '</h2>' + inner.join('') + '</section>';
    }).join('');
  }

  /* появление при прокрутке: добавляем .go когда элемент входит во вьюпорт */
  function revealOnScroll(root) {
    if (!root.querySelectorAll) return;
    var targets = Array.prototype.slice.call(root.querySelectorAll('section, .cards3, .cards, .bars, .chips, .tblwrap'));
    function show(el) {
      el.classList.add('go');
      if (el.className.indexOf('cards') === 0) countUpEls(el);
    }
    if (!('IntersectionObserver' in window)) {
      targets.forEach(show);
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          show(en.target);
          io.unobserve(en.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -10% 0px' });
    targets.forEach(function (el) { io.observe(el); });
  }

  /* анимированный счётчик чисел в карточках */
  function countUpEls(root) {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var els = Array.prototype.slice.call(root.querySelectorAll('.cnum'))
      .filter(function (el) { return /^\d{1,12}$/.test(el.textContent.trim()); });
    els.forEach(function (el) {
      var target = parseInt(el.textContent.trim(), 10);
      if (target === 0) return;
      var dur = 900, t0 = null;
      function step(ts) {
        if (!t0) t0 = ts;
        var p = Math.min(1, (ts - t0) / dur);
        var eased = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.round(target * eased);
        if (p < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    });
  }

  /* ---------- file handling ---------- */

  function handleFile(file) {
    if (!file) return;
    reportEl.innerHTML = '';
    summaryEl.innerHTML = '';
    setStatus('Читаю архив ' + file.name + '…', true);
    var reader = new FileReader();
    reader.onload = function () {
      setStatus('Распаковываю…', true);
      JSZip.loadAsync(reader.result).then(function (zip) {
        var files = new Map();
        var entries = Object.keys(zip.files).map(function (p) { return zip.files[p]; })
          .filter(function (e) { return !e.dir; });
        return Promise.all(entries.map(function (e) {
          return e.async('string').then(function (txt) { files.set(e.name, txt); });
        })).then(function () {
          return TikTokAnalyzer.analyze(files);
        });
      }).then(function (result) {
        if (!result.ok) {
          setStatus(result.error, false);
          return;
        }
        summaryEl.innerHTML = cardsHTML(result.summaryCards);
        renderSections(reportEl, result.sections);
        revealOnScroll(reportEl);
        revealOnScroll(summaryEl);
        setStatus('Готово: ' + file.name, true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }).catch(function (err) {
        setStatus('Ошибка чтения архива: ' + err.message, false);
      });
    };
    reader.onerror = function () { setStatus('Не удалось прочитать файл', false); };
    reader.readAsArrayBuffer(file);
  }

  drop.addEventListener('click', function () { fileInput.click(); });
  drop.addEventListener('dragover', function (e) { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', function () { drop.classList.remove('over'); });
  drop.addEventListener('drop', function (e) {
    e.preventDefault();
    drop.classList.remove('over');
    handleFile(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener('change', function () { handleFile(fileInput.files[0]); });
})();