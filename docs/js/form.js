/* MGR Electrical — enquiry form handling.
   Carried over from the previous site unchanged in behaviour:
   posts to /api/enquiry (Cloudflare Pages Function / _worker.js) and fires
   dataLayer events so GTM records GA4 events + Google Ads conversions.
   New: on any host other than mgrelectrical.com.au (e.g. the GitHub Pages
   preview) the form does not send; it tells people to ring instead. */

/* ---- Ad click attribution -------------------------------------------------
   Captures the Google click id (and campaign params) on WHATEVER page the
   visitor lands on, and stores it for 90 days — Google's maximum offline
   conversion import window. Stored in a first-party cookie so it survives
   navigation between pages. localStorage is a fallback. */
(function () {

  var STORE = 'mgr_attr';
  var DAYS = 90;

  function readStore() {
    try {
      var m = document.cookie.match(/(?:^|;\s*)mgr_attr=([^;]*)/);
      if (m) return JSON.parse(decodeURIComponent(m[1]));
    } catch (e) {}
    try { return JSON.parse(localStorage.getItem(STORE) || 'null'); } catch (e) {}
    return null;
  }

  function writeStore(obj) {
    var v = encodeURIComponent(JSON.stringify(obj));
    var d = new Date(Date.now() + DAYS * 864e5).toUTCString();
    try {
      document.cookie = STORE + '=' + v + ';expires=' + d + ';path=/;SameSite=Lax';
    } catch (e) {}
    try { localStorage.setItem(STORE, JSON.stringify(obj)); } catch (e) {}
  }

  var q = new URLSearchParams(window.location.search);
  /* gclid = normal Google Ads click. gbraid/wbraid = iOS app/web click ids. */
  var id = null, type = null;
  ['gclid', 'gbraid', 'wbraid'].forEach(function (k) {
    if (!id && q.get(k)) { id = q.get(k); type = k; }
  });

  if (id) {
    writeStore({
      id: id,
      type: type,
      src: q.get('utm_source') || 'google',
      med: q.get('utm_medium') || 'cpc',
      cmp: q.get('utm_campaign') || '',
      trm: q.get('utm_term') || '',
      ts: new Date().toISOString()
    });
  }

  window.mgrAttribution = readStore;
})();

(function () {

  /* ---- Google Ads conversions ---------------------------------------------
     Fired by Google Tag Manager (container GTM-NDL5ZBQB), NOT from here.
     The dataLayer pushes below are the only signal this file sends. */

  /* Phone taps are conversions too — on a trades site this is the main action. */
  document.querySelectorAll('a[href^="tel:"]').forEach(function (a) {
    a.addEventListener('click', function () {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({
        event: 'phone_click',
        cta_location: a.getAttribute('data-cta') || 'unknown'
      });
    });
  });

  var form = document.getElementById('enquiryForm');
  if (!form) return;
  var statusEl = document.getElementById('formStatus');
  var btn = document.getElementById('submitBtn');
  var live = /(^|\.)mgrelectrical\.com\.au$/.test(window.location.hostname);

  function setStatus(kind, msg) {
    statusEl.className = 'form-status ' + kind;
    statusEl.textContent = msg;
  }

  /* ---- Australian phone numbers only ---------------------------------------
     Accepts mobiles (04) and landlines (02/03/07/08), typed however people
     type them, with or without +61. Returns E.164 (+61...) or null.
     The real gate is the same check server-side. */
  function auPhone(raw) {
    var s = String(raw || '').replace(/[^\d+]/g, '');
    if (s.indexOf('+') > 0) return null;
    s = s.replace(/^\+/, '');
    if (s.slice(0, 2) === '00') s = s.slice(2);
    if (s.slice(0, 2) === '61') s = '0' + s.slice(2);
    if (!/^0[23478]\d{8}$/.test(s)) return null;
    return '+61' + s.slice(1);
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    var name = form.querySelector('#name').value.trim();
    var phone = form.querySelector('#phone').value.trim();

    if (!name || !phone) {
      setStatus('err', 'Please add your name and a phone number so Mac can call you back.');
      return;
    }

    var auNumber = auPhone(phone);
    if (!auNumber) {
      setStatus('err', 'Please enter an Australian mobile or landline — Mac only works the Coffs Coast.');
      return;
    }

    if (!live) {
      setStatus('preview', 'This is a preview copy of the site, so the form doesn’t send from here. Ring Mac on 0434 023 625.');
      return;
    }

    btn.disabled = true;
    var original = btn.textContent;
    btn.textContent = 'Sending…';

    var data = {};
    new FormData(form).forEach(function (v, k) { data[k] = v; });
    data.phone = auNumber;
    data.page = window.location.pathname;

    var attr = (window.mgrAttribution && window.mgrAttribution()) || null;
    if (attr && attr.id) {
      data.click_id = attr.id;
      data.click_type = attr.type;
      data.utm_source = attr.src;
      data.utm_medium = attr.med;
      data.utm_campaign = attr.cmp;
      data.utm_term = attr.trm;
      data.click_ts = attr.ts;
    }

    fetch('/api/enquiry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, body: j }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error(res.body && res.body.error || 'failed');
        form.reset();
        setStatus('ok', "Thanks — that's come through. Mac will give you a call shortly.");
        window.dataLayer = window.dataLayer || [];
        window.dataLayer.push({ event: 'enquiry_submitted', form_location: data.page });
      })
      .catch(function () {
        setStatus('err', "Sorry — that didn't send. Please ring Mac on 0434 023 625 instead.");
      })
      .finally(function () {
        btn.disabled = false;
        btn.textContent = original;
      });
  });

})();
