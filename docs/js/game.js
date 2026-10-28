/* Mac's Street — the little game on the MGR Electrical home page.
   Art lives in /game as 1x pixel layers (see art/export_game.py); this file
   composites them into a 1x "world" canvas every frame and scales that up
   with nearest-neighbour onto the visible canvas. No libraries. */
(function () {
  'use strict';

  var stage = document.querySelector('[data-game]');
  if (!stage || !window.fetch || !window.Promise) return;

  var base = stage.getAttribute('data-game');
  var canvas = stage.querySelector('canvas');
  var ctx = canvas.getContext('2d');
  var q = function (sel) { return stage.querySelector(sel); };
  var switchBtn = document.querySelector('[data-switch]');
  var switchLabel = document.querySelector('[data-switch-label]');
  var reduceMotion = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  var finePointer = !!(window.matchMedia && matchMedia('(pointer: fine)').matches);

  var M, IMG = {}, HOUSE = {}, world, wctx;
  var dpr = 1, scale = 1, viewW = 0, viewH = 0, viewY = 0, camX = 0;
  var S = null;
  var raf = 0, last = 0, inView = true;

  var MAC_LINES = ['G’day.', 'Need a sparky? 0434 023 625', 'Don’t touch the switchboard.', 'Back in a tick.', 'Ute’s got everything.'];
  var RANKS = [[0, 'First-year apprentice'], [6, 'Fourth-year apprentice'], [12, 'A-grade sparky'], [18, 'Leading hand'], [25, 'Boss of the board']];
  var Z = ['OOOO', '..O.', '.O..', 'OOOO'];

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  /* ------------------------------------------------------------- loading */
  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var i = new Image();
      i.onload = function () { resolve(i); };
      i.onerror = reject;
      i.src = src;
    });
  }

  fetch(base + 'manifest.json')
    .then(function (r) { return r.json(); })
    .then(function (m) {
      M = m;
      var names = ['bg-dusk', 'lit-dusk', 'bg-night', 'lit-night', 'bg-storm', 'lit-storm', 'sprites'];
      return Promise.all(names.map(function (n) {
        return loadImage(base + n + '.png').then(function (i) { IMG[n] = i; });
      }));
    })
    .then(init)
    .catch(function (e) { if (window.console) console.warn('Game failed to load', e); });

  /* ---------------------------------------------------------------- init */
  function init() {
    world = document.createElement('canvas');
    world.width = M.world.w;
    world.height = M.world.h;
    wctx = world.getContext('2d');
    wctx.imageSmoothingEnabled = false;
    M.houses.forEach(function (h) { HOUSE[h.id] = h; });

    S = {
      mode: 'dusk', from: null, fade: 1,
      lit: {}, flicker: {},
      mac: { x: 159, dir: -1, state: 'idle', t: 0.6, carrying: true, job: null, then: null, target: 0, anim: 0, hurry: false },
      switchOn: false, flicks: [],
      storm: null, saved: null,
      sound: false,
      possum: { x: 236, dir: -1, goal: 236, timer: rand(18, 30) },
      bats: [], bolts: [], flash: 0, rain: [], sparks: [], zs: [],
      ute: { flash: 0 },
      priority: null, allLitFor: 0, taps: 0,
      asleep: false, wakeT: 0,
      bubble: null
    };
    M.houses.forEach(function (h) { S.lit[h.id] = (h.id === 'qld' || h.id === 'shop'); });
    for (var i = 0; i < 6; i++) S.bats.push({ x: rand(0, M.world.w), y: rand(8, 30), vx: rand(5, 11), ph: rand(0, 1) });
    for (var j = 0; j < 170; j++) S.rain.push({ x: rand(0, M.world.w + 40), y: rand(-20, M.world.h) });

    try { S.sound = localStorage.getItem('mgr-sound') === 'on'; } catch (e) {}
    syncSoundBtn();

    // 2am: Mac's asleep in his swag. The phone wakes him. He answers.
    var hour = sydneyHour();
    if (hour >= 0 && hour < 5) {
      S.asleep = true;
      S.mode = 'night';
      S.switchOn = true;
      M.houses.forEach(function (h) { S.lit[h.id] = false; });
      S.mac.state = 'sleep';
      S.mac.x = 150;
      S.mac.carrying = false;
      setText('[data-hud-place]', 'Woopi · ' + sydneyTime());
      switchBtn.setAttribute('aria-pressed', 'true');
      switchLabel.textContent = 'Street’s on';
      setTip('Shh. Mac’s asleep.');
    } else {
      setTip(finePointer ? 'Click a house' : 'Tap a house');
    }

    resize();
    camX = camTarget();
    stage.classList.add('is-live');
    canvas.setAttribute('tabindex', '0');
    canvas.removeAttribute('aria-hidden');
    canvas.setAttribute('aria-label', 'Mac’s Street. Press 1 to 5 to tap a house.');

    bindEvents();

    var params = new URLSearchParams(location.search);
    var beat = parseInt(params.get('beat'), 10);
    if (beat >= 0 && beat < 100) {
      setText('[data-beat-text]', 'Your mate kept ' + beat + ' houses lit in the storm. Reckon you can beat that?');
      q('[data-beat]').hidden = false;
    }
    if (params.get('play') === 'storm') openIntro();

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (en) { inView = en[0].isIntersecting; kick(); }, { threshold: 0.05 }).observe(stage);
    }
    document.addEventListener('visibilitychange', kick);
    if ('ResizeObserver' in window) new ResizeObserver(resize).observe(stage);
    else window.addEventListener('resize', resize);

    draw();
    kick();
  }

  function sydneyHour() {
    try {
      return parseInt(new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', hour: 'numeric', hourCycle: 'h23' }).format(new Date()), 10);
    } catch (e) { return new Date().getHours(); }
  }
  function sydneyTime() {
    try {
      return new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', hour: 'numeric', minute: '2-digit' }).format(new Date()).toUpperCase();
    } catch (e) { return ''; }
  }

  /* -------------------------------------------------------------- sizing */
  function resize() {
    if (!M) return;
    var r = stage.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    var cw = Math.max(1, Math.round(r.width * dpr));
    var ch = Math.max(1, Math.round(r.height * dpr));
    canvas.width = cw;
    canvas.height = ch;
    scale = Math.ceil(Math.max(cw / M.world.w, ch / M.world.h));
    viewW = cw / scale;
    viewH = ch / scale;
    viewY = M.world.h - viewH;
    ctx.imageSmoothingEnabled = false;
    camX = clamp(camX, 0, Math.max(0, M.world.w - viewW));
    draw();
  }

  function camTarget() {
    if (viewW >= M.world.w) return 0;
    return clamp(S.mac.x - viewW / 2, 0, M.world.w - viewW);
  }

  /* ---------------------------------------------------------------- loop */
  function shouldRun() {
    return inView && !document.hidden && (!reduceMotion || !!S.storm);
  }
  function kick() {
    if (!S || raf || !shouldRun()) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
  function frame(now) {
    raf = 0;
    var dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    update(dt);
    draw();
    if (shouldRun()) raf = requestAnimationFrame(frame);
  }
  function redraw() { if (!raf) draw(); }

  /* -------------------------------------------------------------- update */
  function update(dt) {
    var mac = S.mac;
    if (S.fade < 1) S.fade = Math.min(1, S.fade + dt / 0.9);
    Object.keys(S.flicker).forEach(function (k) { S.flicker[k] = Math.max(0, S.flicker[k] - dt); });
    S.flash = Math.max(0, S.flash - dt * 2.2);
    S.ute.flash = Math.max(0, S.ute.flash - dt);

    // storm clock + lightning
    var st = S.storm;
    if (st && !st.over) {
      st.left -= dt;
      st.next -= dt;
      if (st.next <= 0) strike();
      if (st.left <= 0) endStorm('time');
      updateStormHud();
    }

    // Mac
    var speed = st ? 95 : (mac.hurry ? 70 : 40);
    switch (mac.state) {
      case 'walk':
        var dx = mac.target - mac.x;
        if (Math.abs(dx) <= speed * dt) { mac.x = mac.target; arrive(); }
        else { mac.dir = dx > 0 ? 1 : -1; mac.x += mac.dir * speed * dt; mac.anim += dt; }
        break;
      case 'work':
        mac.t -= dt;
        if (Math.random() < dt * 40) spark(mac.job);
        if (mac.t <= 0) finishWork();
        break;
      case 'pickup':
        mac.t -= dt;
        if (mac.t <= 0) { mac.carrying = true; sound('thunk'); if (mac.job) goTo(HOUSE[mac.job].door, 'work'); else rest(1); }
        break;
      case 'sleep':
        if (Math.random() < dt * 1.2) S.zs.push({ x: mac.x - 6, y: M.world.path - 9, t: 2.2 });
        if (S.wakeT > 0) { S.wakeT -= dt; if (S.wakeT <= 0) wakeUp(); }
        break;
      case 'wave':
      case 'look':
        mac.t -= dt;
        if (mac.t <= 0) rest(0.4);
        break;
      default: // idle
        mac.t -= dt;
        if (mac.t <= 0 && !st) think(dt);
    }

    // all-lit boredom: eventually somebody switches something off
    if (!st && !S.asleep && allLit()) {
      S.allLitFor += dt;
      if (S.allLitFor > 9 && mac.state === 'idle') {
        S.allLitFor = 0;
        var h = pick(M.houses);
        setLit(h.id, false);
      }
    } else {
      S.allLitFor = 0;
    }

    // possum
    var p = S.possum;
    if (p.goal !== p.x) {
      var pd = p.goal - p.x;
      p.dir = pd > 0 ? 1 : -1;
      p.x += p.dir * Math.min(Math.abs(pd), 45 * dt);
    } else if (!st) {
      p.timer -= dt;
      if (p.timer <= 0) { p.goal = p.x < 244 ? rand(260, 300) : rand(186, 228); p.timer = rand(20, 35); }
    }

    // bats, rain, sparks, zs, bolts
    S.bats.forEach(function (b) {
      b.x += b.vx * dt; b.ph += dt * 4;
      if (b.x > M.world.w + 6) { b.x = -6; b.y = rand(8, 30); }
    });
    if (S.mode === 'storm') {
      S.rain.forEach(function (d) {
        d.y += 160 * dt; d.x -= 38 * dt;
        if (d.y > M.world.h) { d.y = rand(-12, 0); d.x = rand(0, M.world.w + 40); }
      });
    }
    S.sparks = S.sparks.filter(function (s) { s.t -= dt; s.y -= dt * 6; return s.t > 0; });
    S.zs = S.zs.filter(function (z) { z.t -= dt; z.y -= dt * 5; z.x += dt * 2; return z.t > 0; });
    S.bolts = S.bolts.filter(function (b) { b.t -= dt; return b.t > 0; });

    if (S.bubble) { S.bubble.t -= dt; if (S.bubble.t <= 0) hideBubble(); }

    // camera eases after Mac
    camX += (camTarget() - camX) * Math.min(1, dt * 2.4);
    if (st && !st.over) updateEdges();
  }

  function allLit() { return M.houses.every(function (h) { return S.lit[h.id]; }); }
  function darkHouses() { return M.houses.filter(function (h) { return !S.lit[h.id]; }); }
  function nearestDark(x, side) {
    var best = null, bd = 1e9;
    darkHouses().forEach(function (h) {
      if (side && Math.sign(h.door - x) !== side) return;
      var d = Math.abs(h.door - x);
      if (d < bd) { bd = d; best = h; }
    });
    return best;
  }

  function goTo(x, then) {
    var mac = S.mac;
    mac.target = clamp(x, 8, M.world.w - 8);
    mac.then = then;
    mac.state = 'walk';
  }
  function rest(t) { S.mac.state = 'idle'; S.mac.t = t; S.mac.hurry = false; }

  function think() {
    var mac = S.mac;
    var job = null;
    if (S.priority && !S.lit[S.priority]) job = HOUSE[S.priority];
    S.priority = null;
    if (!job) job = nearestDark(mac.x);
    if (job) {
      mac.job = job.id;
      if (!mac.carrying && !mac.hurry) goTo(M.ute.x + 62, 'pickup');   // fetch a unit from the ute
      else goTo(job.door, 'work');
    } else {
      if (Math.random() < 0.4) goTo(rand(40, M.world.w - 40), 'idle');
      else rest(rand(3, 6));
    }
  }

  function arrive() {
    var mac = S.mac;
    if (mac.then === 'pickup') { mac.state = 'pickup'; mac.t = 0.6; return; }
    if (mac.then === 'work') {
      if (mac.job && !S.lit[mac.job]) {
        mac.state = 'work';
        mac.t = S.storm ? 0.45 : 1.3;
        mac.dir = 1;
        return;
      }
      mac.job = null;
      rest(0.3);
      return;
    }
    rest(rand(2, 4));
  }

  function finishWork() {
    var mac = S.mac;
    var id = mac.job;
    mac.job = null;
    mac.hurry = false;
    if (id) {
      setLit(id, true);
      sound('fix');
    }
    if (S.storm && !S.storm.over) {
      S.storm.score++;
      var next = S.storm.queued;
      S.storm.queued = null;
      if (next && !S.lit[next]) { mac.job = next; goTo(HOUSE[next].door, 'work'); return; }
      rest(0.1);
      return;
    }
    mac.carrying = false;
    rest(0.9);
  }

  function spark(id) {
    var h = HOUSE[id];
    if (!h) return;
    S.sparks.push({
      x: Math.round(rand(h.x + 4, h.x + h.w - 4)),
      y: Math.round(rand(h.y + 2, h.y + h.h - 8)),
      t: rand(0.15, 0.35),
      c: pick(['#FFF1C2', '#F5B83D', '#FFFFFF', '#86CDEE'])
    });
  }

  function setLit(id, on, quiet) {
    if (S.lit[id] === on) return;
    S.lit[id] = on;
    if (!reduceMotion) S.flicker[id] = 0.26;
    if (!quiet) sound(on ? 'on' : 'off');
    redraw();
  }

  function setMode(m) {
    if (S.mode === m) return;
    if (reduceMotion) { S.mode = m; S.from = null; S.fade = 1; return; }
    S.from = S.mode;
    S.mode = m;
    S.fade = 0;
  }

  /* -------------------------------------------------------------- storm */
  function openIntro() {
    if (S.storm && !S.storm.over) return;
    q('[data-beat]').hidden = true;
    q('[data-results]').hidden = true;
    q('[data-intro]').hidden = false;
    stage.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
    q('[data-go]').focus({ preventScroll: true });
  }

  function startStorm() {
    q('[data-intro]').hidden = true;
    q('[data-results]').hidden = true;
    if (S.asleep) { S.asleep = false; S.mac.state = 'idle'; }
    if (!S.saved) S.saved = { mode: S.mode, lit: Object.assign({}, S.lit) };
    S.storm = { left: 30, next: 0.9, score: 0, over: false, queued: null };
    setMode('storm');
    M.houses.forEach(function (h) { S.lit[h.id] = true; });
    var mac = S.mac;
    mac.job = null; mac.carrying = false; mac.hurry = false;
    rest(0);
    q('[data-hud-place]').hidden = true;
    q('[data-storm]').hidden = true;
    q('[data-hud-time]').hidden = false;
    q('[data-hud-score]').hidden = false;
    q('[data-quit]').hidden = false;
    q('[data-hud-power]').hidden = false;
    switchBtn.disabled = true;
    setTip(finePointer ? 'Click the dark houses' : 'Tap the dark houses');
    updateStormHud();
    track('game_storm_start');
    kick();
  }

  function strike() {
    var st = S.storm;
    var progress = 1 - st.left / 30;
    st.next = 2.1 - 1.15 * progress + rand(0, 0.5);
    var mac = S.mac;
    var targets = M.houses.filter(function (h) { return S.lit[h.id] && !(mac.state === 'work' && mac.job === h.id); });
    if (!targets.length) return;
    var h = pick(targets);
    S.lit[h.id] = false;
    S.flicker[h.id] = 0;
    // a jagged bolt from the cloud base down to the roof
    var x = h.door + rand(-12, 12), y = 0, pts = [[Math.round(x), 0]];
    var bottom = h.y - 4;
    while (y < bottom) { y += rand(4, 8); x += rand(-4, 4); pts.push([Math.round(x), Math.round(Math.min(y, bottom))]); }
    S.bolts.push({ pts: pts, t: 0.22 });
    if (!reduceMotion) S.flash = 0.5;
    sound('thunder');
    if (navigator.vibrate && !reduceMotion) { try { navigator.vibrate(30); } catch (e) {} }
    if (allDark()) endStorm('blackout');
  }
  function allDark() { return M.houses.every(function (h) { return !S.lit[h.id]; }); }

  function updateStormHud() {
    var st = S.storm;
    if (!st) return;
    setText('[data-hud-time] b', '0:' + String(Math.max(0, Math.ceil(st.left))).padStart(2, '0'));
    setText('[data-hud-score] b', String(st.score));
    var pw = q('[data-hud-power]');
    var n = M.houses.length, on = M.houses.filter(function (h) { return S.lit[h.id]; }).length;
    if (pw.children.length !== n) { pw.innerHTML = ''; for (var i = 0; i < n; i++) pw.appendChild(document.createElement('i')); }
    for (var k = 0; k < n; k++) pw.children[k].className = k < on ? 'on' : '';
  }

  function endStorm(reason) {
    var st = S.storm;
    if (!st || st.over) return;
    st.over = true;
    hideEdges();
    track('game_storm_end', { score: st.score, reason: reason });
    setTimeout(function () {
      var n = st.score;
      setText('[data-res-tape]', reason === 'blackout' ? 'Blackout! Round over' : 'Storm Night · round over');
      setText('[data-res-score]', String(n));
      var rank = RANKS[0][1], next = null;
      for (var i = 0; i < RANKS.length; i++) {
        if (n >= RANKS[i][0]) rank = RANKS[i][1];
        else { next = RANKS[i]; break; }
      }
      setText('[data-res-rank]', rank);
      setText('[data-res-next]', next ? (next[0] - n) + ' more and you’re ' + next[1] + '.' : 'Top of the board. Mac might have a job for you.');
      q('[data-results]').hidden = false;
      q('[data-share]').focus({ preventScroll: true });
    }, reason === 'quit' ? 0 : 700);
  }

  function leaveStorm() {
    q('[data-results]').hidden = true;
    q('[data-intro]').hidden = true;
    S.storm = null;
    var saved = S.saved || { mode: 'dusk', lit: {} };
    S.saved = null;
    setMode(saved.mode === 'storm' ? 'dusk' : saved.mode);
    M.houses.forEach(function (h) { S.lit[h.id] = !!saved.lit[h.id]; });
    q('[data-hud-place]').hidden = false;
    q('[data-storm]').hidden = false;
    q('[data-hud-time]').hidden = true;
    q('[data-hud-score]').hidden = true;
    q('[data-quit]').hidden = true;
    q('[data-hud-power]').hidden = true;
    hideEdges();
    switchBtn.disabled = false;
    setTip(finePointer ? 'Click a house' : 'Tap a house');
    rest(0.5);
    redraw();
    kick();
  }

  function updateEdges() {
    var left = 0, right = 0;
    darkHouses().forEach(function (h) {
      if (h.door < camX + 6) left++;
      else if (h.door > camX + viewW - 6) right++;
    });
    edge('[data-edge="-1"]', left, '◀ ' + left + ' out');
    edge('[data-edge="1"]', right, right + ' out ▶');
  }
  function edge(sel, n, text) {
    var b = q(sel);
    if (!n) { if (!b.hidden) b.hidden = true; return; }
    if (b.textContent !== text) b.textContent = text;
    b.setAttribute('aria-label', n + ' blacked-out house' + (n > 1 ? 's' : '') + (sel.indexOf('-1') > -1 ? ' to the left' : ' to the right'));
    b.hidden = false;
  }
  function hideEdges() { q('[data-edge="-1"]').hidden = true; q('[data-edge="1"]').hidden = true; }

  function share() {
    var n = S.storm ? S.storm.score : 0;
    var url = location.origin + location.pathname.replace(/index\.html$/, '') + '?beat=' + n;
    var text = 'I kept ' + n + ' houses lit in the Woopi storm. Reckon you can beat that?';
    track('game_share', { score: n });
    if (navigator.share) {
      navigator.share({ title: 'Storm Night · MGR Electrical', text: text, url: url }).catch(function () {});
    } else if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text + ' ' + url).then(function () { toast('Link copied. Paste it to a mate.'); }, function () { toast(url); });
    } else {
      toast(url);
    }
  }

  /* ------------------------------------------------------------- input */
  function bindEvents() {
    canvas.addEventListener('click', function (e) {
      var r = canvas.getBoundingClientRect();
      var wx = camX + (e.clientX - r.left) * dpr / scale;
      var wy = viewY + (e.clientY - r.top) * dpr / scale;
      onTap(wx, wy);
    });
    canvas.addEventListener('keydown', function (e) {
      var n = parseInt(e.key, 10);
      if (n >= 1 && n <= M.houses.length) { e.preventDefault(); tapHouse(M.houses[n - 1]); }
    });
    switchBtn.addEventListener('click', flick);
    q('[data-storm]').addEventListener('click', openIntro);
    q('[data-go]').addEventListener('click', startStorm);
    q('[data-cancel]').addEventListener('click', function () { q('[data-intro]').hidden = true; });
    q('[data-quit]').addEventListener('click', function () { if (S.storm) { S.storm.over = true; } leaveStorm(); });
    q('[data-again]').addEventListener('click', function () { S.storm = null; startStorm(); });
    q('[data-done]').addEventListener('click', leaveStorm);
    q('[data-share]').addEventListener('click', share);
    q('[data-beat-go]').addEventListener('click', openIntro);
    q('[data-sound]').addEventListener('click', function () {
      S.sound = !S.sound;
      try { localStorage.setItem('mgr-sound', S.sound ? 'on' : 'off'); } catch (e) {}
      syncSoundBtn();
      sound('on');
    });
    Array.prototype.forEach.call(stage.querySelectorAll('[data-edge]'), function (b) {
      b.addEventListener('click', function () {
        var side = parseInt(b.getAttribute('data-edge'), 10);
        var h = nearestDark(S.mac.x, side);
        if (h) tapHouse(h);
      });
    });
  }

  function onTap(wx, wy) {
    if (S.asleep) { ringPhone(); return; }
    var mac = S.mac, path = M.world.path;
    S.taps++;
    if (S.taps === 4) setTip('');
    // possum on the wire
    var p = S.possum, py = wireY(p.x);
    if (!S.storm && wx > p.x - 3 && wx < p.x + 15 && wy > py - 9 && wy < py + 4) {
      p.goal = p.x < 244 ? 304 : 182;
      sound('squeak');
      return;
    }
    // Mac
    if (Math.abs(wx - mac.x) < 9 && wy > path - 27 && wy < path + 2 && !S.storm) {
      if (mac.state === 'idle' || mac.state === 'walk' || mac.state === 'wave') {
        mac.state = 'wave';
        mac.t = 1.4;
        say(pick(MAC_LINES), 2.2);
        redraw();
      }
      return;
    }
    // ute
    var u = M.ute;
    if (wx > u.x && wx < u.x + 90 && wy > u.y && wy < u.y + 36) {
      S.ute.flash = 0.6;
      sound('horn');
      say('Beep beep!', 1.2, 'ute');
      redraw();
      return;
    }
    // a house: anything in its column above the road
    if (wy < path + 4) {
      for (var i = 0; i < M.houses.length; i++) {
        var h = M.houses[i];
        if (wx >= h.x - 4 && wx <= h.x + h.w + 4) { tapHouse(h); return; }
      }
    }
  }

  function tapHouse(h) {
    var mac = S.mac;
    if (S.asleep) { ringPhone(); return; }
    if (S.storm) {
      if (S.storm.over || S.lit[h.id]) return;
      if (mac.state === 'work') { S.storm.queued = h.id; return; }
      mac.job = h.id;
      goTo(h.door, 'work');
      return;
    }
    if (reduceMotion) { setLit(h.id, !S.lit[h.id]); draw(); return; }
    if (S.lit[h.id]) { setLit(h.id, false); return; }
    // dark: send Mac straight there
    S.priority = h.id;
    if (mac.state === 'work' && mac.job !== h.id) return; // he'll come next
    mac.job = h.id;
    mac.hurry = true;
    goTo(h.door, 'work');
  }

  function flick() {
    if (S.storm) return;
    S.switchOn = !S.switchOn;
    switchBtn.setAttribute('aria-pressed', String(S.switchOn));
    switchLabel.textContent = S.switchOn ? 'Street’s on' : 'Flick it';
    sound('clunk');
    track('game_switch', { on: S.switchOn });
    var now = performance.now();
    S.flicks = S.flicks.filter(function (t) { return now - t < 6000; });
    S.flicks.push(now);
    if (S.flicks.length >= 12 && !S.asleep) {
      S.flicks = [];
      S.mac.state = 'look';
      S.mac.t = 2.2;
      say('Oi. Easy on the switch.', 2.4);
    }
    if (S.asleep) { ringPhone(); return; }
    setMode(S.switchOn ? 'night' : 'dusk');
    var on = S.switchOn;
    M.houses.forEach(function (h, i) {
      if (reduceMotion) { S.lit[h.id] = on; return; }
      setTimeout(function () { if (S.switchOn === on && !S.storm) setLit(h.id, on, i > 0); }, 160 + i * 130);
    });
    if (on && S.mac.state !== 'look') {
      S.mac.state = 'wave';
      S.mac.t = 1.6;
      say('Too easy.', 1.8);
    }
    draw();
    kick();
  }

  function ringPhone() {
    if (S.wakeT > 0) return;
    sound('ring');
    say('Brrring brrring…', 1.4);
    S.wakeT = 1.5;
    kick();
  }
  function wakeUp() {
    S.asleep = false;
    S.mac.state = 'idle';
    S.mac.t = 1.8;
    say('MGR, Mac speaking.', 2.6);
    setTip(finePointer ? 'Click a house' : 'Tap a house');
  }

  /* -------------------------------------------------------------- draw */
  function frameRect(name) { return M.frames[name]; }
  function sprite(name, x, y, flip) {
    var f = frameRect(name);
    if (!flip) { wctx.drawImage(IMG.sprites, f.x, f.y, f.w, f.h, Math.round(x), Math.round(y), f.w, f.h); return; }
    wctx.save();
    wctx.translate(Math.round(x) + f.w, Math.round(y));
    wctx.scale(-1, 1);
    wctx.drawImage(IMG.sprites, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
    wctx.restore();
  }
  function wireY(x) {
    var t = clamp((x - 172) / (317 - 172), 0, 1);
    return 40 + 6 * 4 * t * (1 - t);
  }
  function litShown(id) {
    var f = S.flicker[id];
    if (f > 0 && Math.floor(f * 26) % 2 === 0) return !S.lit[id];
    return S.lit[id];
  }
  function drawScene(mode) {
    wctx.drawImage(IMG['bg-' + mode], 0, 0);
    var lit = IMG['lit-' + mode];
    M.houses.forEach(function (h) {
      if (litShown(h.id)) wctx.drawImage(lit, h.x, h.y, h.w, h.h, h.x, h.y, h.w, h.h);
    });
  }

  function draw() {
    if (!S) return;
    var mac = S.mac, path = M.world.path, W = M.world.w, H = M.world.h;
    drawScene(S.mode);
    if (S.from && S.fade < 1) {
      wctx.globalAlpha = 1 - S.fade;
      drawScene(S.from);
      wctx.globalAlpha = 1;
    }

    // dusk flying foxes
    if (S.mode === 'dusk') {
      S.bats.forEach(function (b) { sprite(Math.floor(b.ph) % 2 ? 'bat-up' : 'bat-down', b.x, b.y); });
    }
    // possum on the wire
    if (S.mode !== 'storm') {
      var p = S.possum;
      sprite('possum', p.x, wireY(p.x + 6) - 4, p.dir > 0);
    }
    // torch glow while Mac works in the dark
    if (mac.state === 'work' && S.mode !== 'dusk' && mac.job) {
      var h = HOUSE[mac.job], g = frameRect('glow-torch');
      sprite('glow-torch', h.door - g.w / 2, h.y + h.h - 22);
    }
    // Mac
    if (mac.state === 'sleep') {
      sprite('swag', mac.x - 14, path - 5);
      sprite('mac-sleep', mac.x - 12, path - 9);
    } else {
      var name;
      if (mac.state === 'wave') name = 'mac-wave';
      else if (mac.state === 'look') name = 'mac-look';
      else if (mac.state === 'walk') name = Math.floor(mac.anim / 0.14) % 2 ? (mac.carrying ? 'mac-boxwalk' : 'mac-walk') : (mac.carrying ? 'mac-box' : 'mac-idle');
      else name = mac.carrying ? 'mac-box' : 'mac-idle';
      var f = frameRect(name);
      sprite(name, mac.x - f.w / 2, path - f.h, mac.dir < 0 && mac.state !== 'look');
    }
    // ute, headlights, beacon
    var u = M.ute;
    if (S.mode !== 'dusk' || S.ute.flash > 0) {
      var hl = frameRect('glow-headlight');
      var times = S.ute.flash > 0 && Math.floor(S.ute.flash * 8) % 2 === 0 ? 2 : 1;
      for (var k = 0; k < times; k++) sprite('glow-headlight', u.front - hl.w, u.headlight[1] - hl.h / 2);
    }
    sprite('ute', u.x, u.y);
    if (S.mode === 'storm' && Math.floor(performance.now() / 380) % 2 === 0) {
      var bg = frameRect('glow-beacon');
      sprite('glow-beacon', u.beacon[0] - bg.w / 2, u.beacon[1] - bg.h / 2);
      wctx.fillStyle = '#F5B83D';
      wctx.fillRect(u.beacon[0] - 1, u.beacon[1] - 1, 3, 2);
    }
    // sparks + zzz
    S.sparks.forEach(function (s) { wctx.fillStyle = s.c; wctx.fillRect(Math.round(s.x), Math.round(s.y), 1, 1); });
    S.zs.forEach(function (z) {
      wctx.globalAlpha = Math.min(1, z.t);
      glyph(Z, z.x, z.y, '#F4F1EA');
      wctx.globalAlpha = 1;
    });
    // storm: rain, bolts, flash
    if (S.mode === 'storm') {
      wctx.fillStyle = 'rgba(120,140,190,0.55)';
      S.rain.forEach(function (d) { wctx.fillRect(Math.round(d.x), Math.round(d.y), 1, 3); });
      S.bolts.forEach(function (b) {
        for (var i = 1; i < b.pts.length; i++) {
          line(b.pts[i - 1], b.pts[i], '#CFE4FF', 1);
          line(b.pts[i - 1], b.pts[i], '#FFFFFF', 0);
        }
      });
      if (S.flash > 0) {
        wctx.fillStyle = 'rgba(220,232,255,' + (S.flash * 0.55) + ')';
        wctx.fillRect(0, 0, W, H);
      }
    }

    // world -> screen, nearest neighbour
    var cx = Math.round(camX * scale) / scale;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(world, cx, viewY, viewW, viewH, 0, 0, canvas.width, canvas.height);
    placeBubble(cx);
  }

  function glyph(rows, x, y, col) {
    wctx.fillStyle = col;
    for (var j = 0; j < rows.length; j++)
      for (var i = 0; i < rows[j].length; i++)
        if (rows[j][i] === 'O') wctx.fillRect(Math.round(x) + i, Math.round(y) + j, 1, 1);
  }
  function line(a, b, col, off) {
    wctx.fillStyle = col;
    var x0 = a[0] + off, y0 = a[1], x1 = b[0] + off, y1 = b[1];
    var dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, err = dx + dy;
    for (var n = 0; n < 400; n++) {
      wctx.fillRect(x0, y0, 1, 1);
      if (x0 === x1 && y0 === y1) break;
      var e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  /* ---------------------------------------------------------- bubbles */
  function say(text, t, anchor) {
    S.bubble = { text: text, t: t, anchor: anchor || 'mac' };
    var b = q('[data-bubble]');
    b.textContent = text;
    b.hidden = false;
    kick();
  }
  function hideBubble() { S.bubble = null; q('[data-bubble]').hidden = true; }
  function placeBubble(cx) {
    if (!S.bubble) return;
    var wx, wy;
    if (S.bubble.anchor === 'ute') { wx = M.ute.x + 30; wy = M.ute.y - 4; }
    else { wx = S.mac.x; wy = M.world.path - (S.mac.state === 'sleep' ? 12 : 30); }
    var b = q('[data-bubble]');
    var r = stage.getBoundingClientRect();
    var sx = (wx - cx) * scale / dpr, sy = (wy - viewY) * scale / dpr;
    var half = b.offsetWidth / 2 + 6;
    b.style.left = clamp(sx, half, r.width - half) + 'px';
    b.style.top = Math.max(b.offsetHeight + 6, sy) + 'px';
  }

  /* --------------------------------------------------------------- hud */
  function setText(sel, text) { var el = q(sel); if (el) el.textContent = text; }
  function setTip(text) {
    var tip = q('[data-tip]');
    if (!text) { tip.hidden = true; return; }
    tip.hidden = false;
    setText('[data-tip-text]', text);
  }
  var toastTimer = 0;
  function toast(text) {
    var t = q('[data-toast]');
    t.textContent = text;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 2600);
  }
  function syncSoundBtn() {
    var b = q('[data-sound]');
    b.setAttribute('aria-pressed', String(S.sound));
    b.setAttribute('aria-label', S.sound ? 'Sound on. Turn sound off' : 'Sound off. Turn sound on');
    b.querySelector('[data-sound-x]').style.display = S.sound ? 'none' : '';
    var w = b.querySelector('[data-sound-waves]');
    if (S.sound) w.removeAttribute('hidden'); else w.setAttribute('hidden', '');
  }
  function track(event, data) {
    window.dataLayer = window.dataLayer || [];
    var o = { event: event };
    if (data) Object.keys(data).forEach(function (k) { o[k] = data[k]; });
    window.dataLayer.push(o);
  }

  /* ------------------------------------------------------------- sound */
  var AC = null;
  function audio() {
    if (!S || !S.sound) return null;
    if (!AC) {
      var C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      try { AC = new C(); } catch (e) { return null; }
    }
    if (AC.state === 'suspended') AC.resume();
    return AC;
  }
  function tone(ac, freq, dur, type, vol, when, to) {
    var o = ac.createOscillator(), g = ac.createGain(), t0 = ac.currentTime + (when || 0);
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t0);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(ac.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }
  function noise(ac, dur, vol, freq, when) {
    var n = Math.floor(ac.sampleRate * dur), buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    var s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain(), t0 = ac.currentTime + (when || 0);
    s.buffer = buf;
    f.type = 'lowpass';
    f.frequency.value = freq;
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f).connect(g).connect(ac.destination);
    s.start(t0);
  }
  function sound(name) {
    var ac = audio();
    if (!ac) return;
    switch (name) {
      case 'clunk': noise(ac, 0.06, 0.35, 1800); tone(ac, 110, 0.08, 'square', 0.06); break;
      case 'on': tone(ac, 880, 0.05, 'square', 0.03); break;
      case 'off': tone(ac, 330, 0.06, 'square', 0.03); break;
      case 'fix': tone(ac, 660, 0.12, 'square', 0.035, 0, 1320); break;
      case 'thunk': noise(ac, 0.05, 0.25, 600); break;
      case 'thunder': noise(ac, 1.4, 0.5, 260, 0.15); noise(ac, 0.12, 0.3, 3000); break;
      case 'horn': tone(ac, 392, 0.16, 'square', 0.05); tone(ac, 494, 0.16, 'square', 0.04); tone(ac, 392, 0.2, 'square', 0.05, 0.22); tone(ac, 494, 0.2, 'square', 0.04, 0.22); break;
      case 'ring': for (var i = 0; i < 6; i++) tone(ac, i % 2 ? 1000 : 1250, 0.09, 'sine', 0.05, i * 0.1); break;
      case 'squeak': tone(ac, 1800, 0.08, 'triangle', 0.03, 0, 2600); break;
    }
  }
})();
