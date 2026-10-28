/* MGR Electrical — menu, sticky call bar, small bits. */
(function () {
  'use strict';

  /* ---- switchboard menu ---- */
  var board = document.getElementById('switchboard');
  var opener = document.querySelector('[data-menu-open]');
  var lastFocus = null;

  function openMenu() {
    lastFocus = document.activeElement;
    board.hidden = false;
    document.documentElement.style.overflow = 'hidden';
    if (opener) opener.setAttribute('aria-expanded', 'true');
    var close = board.querySelector('[data-menu-close]');
    if (close) close.focus();
  }
  function closeMenu() {
    board.hidden = true;
    document.documentElement.style.overflow = '';
    if (opener) opener.setAttribute('aria-expanded', 'false');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  if (board && opener) {
    opener.addEventListener('click', openMenu);
    board.querySelector('[data-menu-close]').addEventListener('click', closeMenu);
    board.addEventListener('click', function (e) {
      var a = e.target.closest('a');
      if (a && a.getAttribute('href').charAt(0) === '#') closeMenu();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !board.hidden) closeMenu();
      if (e.key === 'Tab' && !board.hidden) {
        var f = board.querySelectorAll('a,button');
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
  }

  /* ---- sticky call bar: shows once the page's own call buttons have
     scrolled away, hides again while the quote form is on screen ---- */
  var bar = document.querySelector('[data-callbar]');
  if (bar && 'IntersectionObserver' in window) {
    var heroCtas = document.querySelectorAll('[data-hero-cta]');
    var quote = document.getElementById('quote');
    var heroVisible = heroCtas.length > 0;
    var quoteVisible = false;
    var seen = new Map();
    function update() {
      var scrolled = window.scrollY > 240;
      bar.classList.toggle('show', !heroVisible && !quoteVisible && scrolled);
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { seen.set(en.target, en.isIntersecting); });
      heroVisible = false;
      heroCtas.forEach(function (el) { if (seen.get(el)) heroVisible = true; });
      quoteVisible = quote ? !!seen.get(quote) : false;
      update();
    }, { threshold: 0 });
    heroCtas.forEach(function (el) { io.observe(el); });
    if (quote) io.observe(quote);
    window.addEventListener('scroll', update, { passive: true });
    update();
  }

  var y = document.querySelector('[data-year]');
  if (y) y.textContent = new Date().getFullYear();
})();
