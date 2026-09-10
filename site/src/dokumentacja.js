/* Ninerdeck - dokumentacja: wyszukiwarka (search.json w przeglądarce), szuflada spisu treści
   na telefonie i podświetlanie „na tej stronie". Bez zależności. */
(function () {
  'use strict';

  // ── wyszukiwarka ────────────────────────────────────────────────────────
  // Składanie znaków (NFD) zdejmuje ogonki, więc „ą" → „a" bez zmiany długości tekstu;
  // dzięki temu pozycje trafień w tekście złożonym pasują do tekstu oryginalnego.
  var fold = function (s) { return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l'); };
  var escapeHtml = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var escapeRe = function (s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); };
  var terms = function (q) { return fold(q).split(/[^a-z0-9]+/).filter(function (t) { return t.length >= 2; }).slice(0, 6); };
  var index = null, loading = null;

  function load(docroot) {
    if (index) return Promise.resolve(index);
    if (!loading) loading = fetch(docroot + 'search.json').then(function (r) { return r.json(); }).then(function (d) {
      index = d.map(function (p) { return { p: p, t: fold(p.t), c: fold(p.c), l: fold(p.l), h: fold(p.h.join(' | ')), b: fold(p.b) }; });
      return index;
    });
    return loading;
  }
  function countIn(text, term) { var n = 0, i = 0; while ((i = text.indexOf(term, i)) !== -1) { n++; i += term.length; if (n > 40) break; } return n; }
  function wordStart(text, term) { return new RegExp('(^|[^a-z0-9])' + escapeRe(term)).test(text); }
  function score(doc, ts) {
    var s = 0;
    for (var k = 0; k < ts.length; k++) {
      var t = ts[k], hit = false;
      if (doc.t.indexOf(t) !== -1) { s += wordStart(doc.t, t) ? 40 : 24; hit = true; }
      if (doc.h.indexOf(t) !== -1) { s += 14; hit = true; }
      if (doc.l.indexOf(t) !== -1) { s += 8; hit = true; }
      var n = countIn(doc.b, t);
      if (n) { s += Math.min(n, 10) * 2 + (wordStart(doc.b, t) ? 3 : 0); hit = true; }
      if (doc.c.indexOf(t) !== -1) { s += 3; hit = true; }
      if (!hit) return 0; // każde słowo zapytania musi paść gdzieś w stronie
    }
    return s;
  }
  function snippet(p, ts) {
    var b = p.b, fb = fold(b), pos = -1;
    for (var k = 0; k < ts.length && pos === -1; k++) pos = fb.indexOf(ts[k]);
    if (pos === -1) return p.l || b.slice(0, 150);
    var start = Math.max(0, pos - 70), end = Math.min(b.length, pos + 110);
    if (start > 0) { var sp = b.lastIndexOf(' ', start + 20); if (sp > 0 && sp < start + 20) start = sp + 1; }
    return (start > 0 ? '…' : '') + b.slice(start, end) + (end < b.length ? '…' : '');
  }
  function mark(text, ts) {
    var f = fold(text), ranges = [];
    ts.forEach(function (t) { var i = 0; while ((i = f.indexOf(t, i)) !== -1) { ranges.push([i, i + t.length]); i += t.length; } });
    if (!ranges.length) return escapeHtml(text);
    ranges.sort(function (a, b) { return a[0] - b[0]; });
    var out = '', at = 0;
    ranges.forEach(function (r) { if (r[0] < at) return; out += escapeHtml(text.slice(at, r[0])) + '<mark>' + escapeHtml(text.slice(r[0], r[1])) + '</mark>'; at = r[1]; });
    return out + escapeHtml(text.slice(at));
  }

  function initSearch(box) {
    var input = box.querySelector('input'), ul = box.querySelector('.doc-results'), docroot = box.getAttribute('data-docroot') || './';
    var active = -1, timer = null, lastQ = '';
    function close() { ul.hidden = true; ul.innerHTML = ''; box.classList.remove('open'); active = -1; input.setAttribute('aria-expanded', 'false'); }
    function setActive(i) {
      var items = ul.querySelectorAll('li[role="option"]');
      if (!items.length) return;
      active = (i + items.length) % items.length;
      items.forEach(function (li, k) { li.classList.toggle('active', k === active); });
      var el = items[active]; if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
    }
    function show(results, ts) {
      ul.innerHTML = '';
      if (!results.length) {
        var e = document.createElement('li'); e.className = 'empty'; e.textContent = 'Brak wyników. Spróbuj innego słowa - na przykład „zdanie", „paliwo", „PIN".'; ul.appendChild(e);
      } else {
        results.forEach(function (r) {
          var li = document.createElement('li'); li.setAttribute('role', 'option');
          li.innerHTML = '<a href="' + docroot + r.p.u + '"><span class="r-chapter">' + escapeHtml(r.p.c) + '</span><b>' + mark(r.p.t, ts) + '</b><span class="r-snip">' + mark(snippet(r.p, ts), ts) + '</span></a>';
          ul.appendChild(li);
        });
      }
      ul.hidden = false; box.classList.add('open'); active = -1; input.setAttribute('aria-expanded', 'true');
    }
    function run() {
      var q = input.value.trim(); lastQ = q;
      var ts = terms(q);
      if (!ts.length) { close(); return; }
      load(docroot).then(function (idx) {
        if (input.value.trim() !== lastQ) return;
        var results = idx.map(function (d) { return { p: d.p, s: score(d, ts) }; }).filter(function (r) { return r.s > 0; })
          .sort(function (a, b) { return b.s - a.s; }).slice(0, 8);
        show(results, ts);
      }).catch(function () { close(); });
    }
    input.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(run, 90); });
    input.addEventListener('focus', function () { load(docroot); if (input.value.trim()) run(); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); if (ul.hidden) run(); else setActive(active + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
      else if (e.key === 'Enter') { var a = ul.querySelector(active >= 0 ? 'li.active a' : 'li[role="option"] a'); if (a) { e.preventDefault(); location.href = a.getAttribute('href'); } }
      else if (e.key === 'Escape') { if (!ul.hidden) { e.preventDefault(); close(); } else input.blur(); }
    });
    document.addEventListener('click', function (e) { if (!box.contains(e.target)) close(); });
  }
  var boxes = Array.prototype.slice.call(document.querySelectorAll('.doc-search'));
  boxes.forEach(initSearch);

  // „/" skupia wyszukiwarkę (jak w dokumentacjach, do których użytkownik jest przyzwyczajony).
  document.addEventListener('keydown', function (e) {
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
    var t = e.target, tag = t && t.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || (t && t.isContentEditable)) return;
    var visible = boxes.filter(function (b) { return b.offsetParent !== null; })[0];
    if (visible) { e.preventDefault(); visible.querySelector('input').focus(); }
  });

  // ── szuflada spisu treści (telefon) ─────────────────────────────────────
  var side = document.getElementById('doc-side');
  function setTree(open) {
    document.body.classList.toggle('tree-open', open);
    document.querySelectorAll('[data-toggle-tree]').forEach(function (b) { b.setAttribute('aria-expanded', open ? 'true' : 'false'); });
  }
  document.querySelectorAll('[data-toggle-tree]').forEach(function (b) { b.addEventListener('click', function () { setTree(!document.body.classList.contains('tree-open')); }); });
  document.querySelectorAll('[data-close-tree]').forEach(function (b) { b.addEventListener('click', function () { setTree(false); }); });
  document.querySelectorAll('[data-focus-search]').forEach(function (b) { b.addEventListener('click', function () {
    setTree(true);
    var input = side && side.querySelector('.doc-search input');
    if (input) setTimeout(function () { input.focus(); }, 260);
  }); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && document.body.classList.contains('tree-open')) setTree(false); });

  // Bieżąca strona w drzewku - widoczna od razu po otwarciu szuflady.
  var on = side && side.querySelector('.doc-tree a.on');
  if (on && on.scrollIntoView) { try { on.scrollIntoView({ block: 'center' }); } catch (err) { /* stare przeglądarki */ } }


  // ── makiety panelu: ramka przycięta do treści ───────────────────────────
  // Makieta rysuje pełne okno 1440x900, bo tak wygląda panel w przeglądarce.
  // W podręczniku pusty dół okna byłby jednak samą stratą miejsca, więc ramka
  // kurczy się do ostatniego elementu treści (iframe jest z tego samego origin).
  Array.prototype.forEach.call(document.querySelectorAll(".panel-frame iframe"), function (frame) {
    function fit() {
      try {
        var doc = frame.contentDocument;
        if (!doc) return;
        var content = doc.querySelector(".content") || doc.querySelector(".browser");
        if (!content) return;
        var bottom = 0;
        Array.prototype.forEach.call(content.querySelectorAll("*"), function (el) {
          var b = el.getBoundingClientRect().bottom;
          if (b > bottom && b < 2000) bottom = b;
        });
        if (bottom < 200) return;
        var h = Math.min(900, Math.ceil(bottom + 26));
        frame.parentElement.style.setProperty("--fit-h", h + "px");
      } catch (err) { /* inny origin albo makieta bez treści - zostaje pełne okno */ }
    }
    frame.addEventListener("load", fit);
    if (frame.contentDocument && frame.contentDocument.readyState === "complete") fit();
  });
  // ── „na tej stronie": podświetlenie sekcji w zasięgu wzroku ─────────────
  var tocLinks = Array.prototype.slice.call(document.querySelectorAll('.doc-toc a'));
  var heads = tocLinks.map(function (a) { return document.getElementById(a.getAttribute('href').slice(1)); }).filter(Boolean);
  if (heads.length) {
    var ticking = false;
    function spy() {
      ticking = false;
      var y = window.scrollY + 120, cur = heads[0];
      heads.forEach(function (h) { if (h.offsetTop <= y) cur = h; });
      tocLinks.forEach(function (a) { a.classList.toggle('on', a.getAttribute('href') === '#' + cur.id); });
    }
    window.addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(spy); } }, { passive: true });
    spy();
  }
})();
