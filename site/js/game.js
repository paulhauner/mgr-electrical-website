/* Mac's Street — the little game on the MGR Electrical home page.
   Art lives in /game as 1x pixel layers (see art/export_game.py); this file
   composites them into a 1x "world" canvas every frame and scales that up
   with nearest-neighbour onto the visible canvas. No libraries, no sound.

   How the street works:
   - The big switch under the stage is the street's MAIN SWITCH. Off means no
     house lights, no aircons, no streetlights. Leave it off and Mac walks to
     the meter box and puts it back on himself.
   - Each house has a light and an aircon. A blown globe = Mac fetches a globe
     from the ute and puts it in. No outdoor unit = Mac carries one over and
     installs it, then cool (or warm) air comes out. An aircon "playing up"
     (red light flashing) = Mac services it.
   - Storm Night: lightning knocks houses out (tap them to send Mac), and now
     and then trips the main switch. Flick it back on fast or the street
     blacks out. */
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
  var TAP = finePointer ? 'Click' : 'Tap';

  var M, IMG = {}, HOUSE = {}, world, wctx;
  var dpr = 1, scale = 1, viewW = 0, viewH = 0, viewY = 0, camX = 0;
  var S = null, clock = 0;
  var raf = 0, last = 0, inView = true;

  var MAC_LINES = ['G’day.', 'Need a sparky? 0434 023 625', 'Don’t touch the switchboard.', 'Back in a tick.', 'Ute’s got everything.'];
  var RANKS = [[0, 'First-year apprentice'], [6, 'Fourth-year apprentice'], [12, 'A-grade sparky'], [18, 'Leading hand'], [25, 'Boss of the board']];
  var Z = ['OOOO', '..O.', '.O..', 'OOOO'];
  var AIR = { cool: '#86CDEE', warm: '#F59A5B' };
  var TRIP_LIMIT = 6;      // seconds to reset a tripped main before blackout
  var STORM_LEN = 30;

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
        return loadImage(base + n + '.png?v=2').then(function (i) { IMG[n] = i; });
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

    var hour = sydneyHour();
    S = {
      mode: (hour >= 19 || hour < 5) ? 'night' : 'dusk', from: null, fade: 1,
      mains: reduceMotion, offFor: 0, flicks: [], toldOff: false,
      house: {}, flicker: {}, wait: {},
      mac: { x: 159, dir: -1, state: 'idle', t: 1.2, carry: null, want: null, job: null, then: null, target: 0, anim: 0, hurry: false },
      storm: null, saved: null,
      possum: { x: 236, dir: -1, goal: 236, timer: rand(18, 30) },
      bats: [], bolts: [], flash: 0, rain: [], sparks: [], zs: [],
      ute: { flash: 0 },
      priority: null, eventT: rand(5, 8), taps: 0,
      asleep: false, wakeT: 0,
      bubble: null
    };
    // Who needs what when the page opens: a blown globe and no aircon at the
    // fibro, no aircon at the brick house, and the units' aircon playing up.
    var month = sydneyMonth();
    var season = month >= 11 || month <= 3 ? 'cool' : (month >= 5 && month <= 8 ? 'warm' : null);
    var mixed = { fibro: 'cool', qld: 'cool', brick: 'warm', shop: 'cool', units: 'warm' };
    M.houses.forEach(function (h) {
      S.house[h.id] = { light: 'ok', off: false, ac: 'ok', air: season || mixed[h.id] || 'cool' };
    });
    S.house.fibro.light = 'blown';
    S.house.fibro.ac = 'none';
    S.house.brick.ac = 'none';
    S.house.units.ac = 'fault';

    for (var i = 0; i < 6; i++) S.bats.push({ x: rand(0, M.world.w), y: rand(8, 30), vx: rand(5, 11), ph: rand(0, 1) });
    for (var j = 0; j < 170; j++) S.rain.push({ x: rand(0, M.world.w + 40), y: rand(-20, M.world.h) });

    // 2am: Mac's asleep in his swag, the street's lights are off (aircons
    // humming). Any tap rings his phone. He answers.
    if (hour >= 0 && hour < 5) {
      S.asleep = true;
      S.mode = 'night';
      S.mains = true;
      M.houses.forEach(function (h) { S.house[h.id].off = true; });
      S.mac.state = 'sleep';
      S.mac.x = 150;
      setText('[data-hud-place]', 'Woopi · ' + sydneyTime());
      setTip('Shh. Mac’s asleep.');
    } else {
      setTip(S.mains ? TAP + ' a house' : 'Flick the main switch');
    }
    syncSwitch();

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

  function sydneyPart(opts) {
    try {
      opts.timeZone = 'Australia/Sydney';
      return parseInt(new Intl.DateTimeFormat('en-AU', opts).format(new Date()), 10);
    } catch (e) { return NaN; }
  }
  function sydneyHour() {
    var h = sydneyPart({ hour: 'numeric', hourCycle: 'h23' });
    return isNaN(h) ? new Date().getHours() : h;
  }
  function sydneyMonth() {
    var m = sydneyPart({ month: 'numeric' });
    return isNaN(m) ? new Date().getMonth() + 1 : m;
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

  /* --------------------------------------------------------- house state */
  function hs(id) { return S.house[id]; }
  function powered() { return S.mains; }
  function lightOn(id) { var h = hs(id); return powered() && h.light === 'ok' && !h.off; }
  function acRunning(id) { return powered() && hs(id).ac === 'ok'; }
  // The next thing Mac has to do at a house, if anything.
  function jobAt(id) {
    var h = hs(id);
    if (h.light === 'storm') return 'storm';
    if (S.storm) return null;
    if (h.light === 'blown') return 'globe';
    if (h.ac === 'none') return 'install';
    if (h.ac === 'fault') return 'service';
    return null;
  }
  function needs(kind) { return kind === 'globe' ? 'globe' : kind === 'install' ? 'box' : null; }
  function jobs() { return M.houses.filter(function (h) { return jobAt(h.id); }); }
  function nearestJob(x, side) {
    var best = null, bd = 1e9;
    jobs().forEach(function (h) {
      if (side && Math.sign(h.door - x) !== side) return;
      var d = Math.abs(h.door - x);
      if (d < bd) { bd = d; best = h; }
    });
    return best;
  }
  function flick(id) { if (!reduceMotion) S.flicker[id] = 0.26; }

  /* -------------------------------------------------------------- update */
  function update(dt) {
    var mac = S.mac;
    clock += dt;
    if (S.fade < 1) S.fade = Math.min(1, S.fade + dt / 0.9);
    Object.keys(S.flicker).forEach(function (k) { S.flicker[k] = Math.max(0, S.flicker[k] - dt); });
    Object.keys(S.wait).forEach(function (k) {
      if (S.wait[k] <= 0) return;
      S.wait[k] -= dt;
      if (S.wait[k] <= 0) flick(k);
    });
    S.flash = Math.max(0, S.flash - dt * 2.2);
    S.ute.flash = Math.max(0, S.ute.flash - dt);

    // storm clock, lightning, tripped main
    var st = S.storm;
    if (st && !st.over) {
      st.left -= dt;
      if (st.tripped) {
        st.trippedFor += dt;
        var left = Math.ceil(TRIP_LIMIT - st.trippedFor);
        if (left !== st.shown) { st.shown = left; setTip('Main switch tripped! Flick it · ' + Math.max(0, left)); }
        if (st.trippedFor >= TRIP_LIMIT) endStorm('blackout');
      } else {
        st.next -= dt;
        st.nextTrip -= dt;
        if (st.nextTrip <= 0) trip();
        else if (st.next <= 0) strike();
      }
      if (st.left <= 0) endStorm('time');
      updateStormHud();
    }

    // main switch left off: Mac sorts it out himself
    if (!st && !S.mains && !S.asleep) {
      S.offFor += dt;
      if (S.offFor > 5 && mac.then !== 'meter' && mac.job !== 'meter' && (mac.state === 'idle' || mac.state === 'walk')) {
        mac.job = 'meter';
        mac.hurry = true;
        say(S.toldOff ? 'I’ll get it.' : 'Who turned the power off?', 2);
        S.toldOff = true;
        goTo(M.meter[0] + 2, 'meter');
      }
    } else {
      S.offFor = 0;
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
        mac.anim += dt;
        if (Math.random() < dt * 30) spark(mac.job);
        if (mac.t <= 0) finishWork();
        break;
      case 'pickup':
        mac.t -= dt;
        if (mac.t <= 0) { mac.carry = mac.want; mac.want = null; rest(0); }
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
        if (mac.t <= 0) think();
    }

    // a quiet street doesn't stay quiet: a globe blows or an aircon plays up
    if (!st && !S.asleep && S.mains && !jobs().length && (mac.state === 'idle' || mac.then === 'stroll')) {
      S.eventT -= dt;
      if (S.eventT <= 0) { S.eventT = rand(6, 10); randomEvent(); }
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

  function goTo(x, then) {
    var mac = S.mac;
    mac.target = clamp(x, 8, M.world.w - 8);
    mac.then = then;
    mac.state = 'walk';
  }
  function rest(t) { S.mac.state = 'idle'; S.mac.t = t; S.mac.then = null; }

  function think() {
    var mac = S.mac;
    if (S.asleep) return;
    if (mac.job === 'meter') { goTo(M.meter[0] + 2, 'meter'); return; }
    var h = null;
    if (S.priority && jobAt(S.priority)) h = HOUSE[S.priority];
    S.priority = null;
    if (!h && mac.job && jobAt(mac.job)) h = HOUSE[mac.job];
    if (!h) h = nearestJob(mac.x);
    if (h) {
      var kind = jobAt(h.id), want = needs(kind);
      mac.job = h.id;
      if (want && mac.carry !== want) { mac.want = want; goTo(M.ute.x + 62, 'pickup'); }   // back to the ute for parts
      else goTo(h.door, 'work');
      return;
    }
    mac.job = null;
    mac.hurry = false;
    if (S.storm) { rest(0.1); return; }
    if (Math.random() < 0.4) goTo(rand(40, M.world.w - 40), 'stroll');
    else rest(rand(3, 6));
  }

  function arrive() {
    var mac = S.mac, then = mac.then;
    mac.then = null;
    if (then === 'pickup') { mac.state = 'pickup'; mac.t = 0.6; return; }
    if (then === 'meter') {
      mac.state = 'work';
      mac.t = 0.6;
      mac.dir = 1;
      return;
    }
    if (then === 'work') {
      var kind = mac.job && jobAt(mac.job);
      if (kind) {
        mac.state = 'work';
        mac.kind = kind;
        mac.t = { storm: 0.45, globe: 1.2, install: 1.8, service: 1.4 }[kind];
        mac.anim = 0;
        mac.dir = 1;
        return;
      }
      rest(0.2);
      return;
    }
    rest(rand(2, 4));
  }

  function finishWork() {
    var mac = S.mac;
    if (mac.job === 'meter') {
      mac.job = null;
      mac.hurry = false;
      setMains(true);
      say('Power’s back on.', 1.8);
      rest(0.8);
      return;
    }
    var id = mac.job, kind = mac.kind, h = id && hs(id);
    mac.job = null;
    mac.kind = null;
    if (h) {
      if (kind === 'storm') { h.light = 'ok'; flick(id); }
      if (kind === 'globe') { h.light = 'ok'; h.off = false; flick(id); mac.carry = null; }
      if (kind === 'install') { h.ac = 'ok'; mac.carry = null; burst(HOUSE[id].cond[0] + 2, HOUSE[id].cond[1] + 2, 10); if (S.mains && Math.random() < 0.6) say(h.air === 'warm' ? 'Nice and toasty.' : 'Nice and cool.', 1.6); }
      if (kind === 'service') { h.ac = 'ok'; }
    }
    if (S.storm && !S.storm.over) {
      if (kind === 'storm') S.storm.score++;
      var next = S.storm.queued;
      S.storm.queued = null;
      if (next && jobAt(next)) { mac.job = next; goTo(HOUSE[next].door, 'work'); return; }
      rest(0.05);
      return;
    }
    mac.hurry = false;
    rest(jobs().length ? 0.4 : 1.2);
    redraw();
  }

  function randomEvent() {
    var candidates = [];
    M.houses.forEach(function (h) {
      var x = hs(h.id);
      if (x.light === 'ok' && !x.off) candidates.push([h.id, 'globe']);
      if (x.ac === 'ok') candidates.push([h.id, 'ac']);
    });
    if (!candidates.length) return;
    var c = pick(candidates), h = HOUSE[c[0]];
    if (c[1] === 'globe') {
      hs(c[0]).light = 'blown';
      var r = h.rooms[0];
      burst(r[0] + r[2] / 2, r[1] + 4, 8);
      flick(c[0]);
    } else {
      hs(c[0]).ac = 'fault';
    }
    redraw();
  }

  function spark(id) {
    var mac = S.mac, x, y;
    if (id === 'meter') { x = M.meter[0] + rand(0, 6); y = M.meter[1] + rand(1, 8); }
    else {
      var h = HOUSE[id];
      if (!h) return;
      if (mac.kind === 'install') { x = h.cond[0] + rand(-1, 7); y = h.cond[1] + rand(-1, 5); }
      else if (mac.kind === 'service') { var u = pick(h.heads); x = u[0] + rand(0, 8); y = u[1] + rand(0, 4); }
      else if (mac.kind === 'globe') { var r = pick(h.rooms); x = r[0] + rand(4, r[2] - 4); y = r[1] + rand(1, 7); }
      else { x = rand(h.x + 4, h.x + h.w - 4); y = rand(h.y + 2, h.y + h.h - 8); }
    }
    S.sparks.push({ x: Math.round(x), y: Math.round(y), t: rand(0.15, 0.35), c: pick(['#FFF1C2', '#F5B83D', '#FFFFFF', '#86CDEE']) });
  }
  function burst(x, y, n) {
    for (var i = 0; i < n; i++) {
      S.sparks.push({ x: Math.round(x + rand(-4, 4)), y: Math.round(y + rand(-3, 3)), t: rand(0.2, 0.5), c: pick(['#FFF1C2', '#F5B83D', '#FFFFFF']) });
    }
  }

  function setMode(m) {
    if (S.mode === m) return;
    if (reduceMotion) { S.mode = m; S.from = null; S.fade = 1; return; }
    S.from = S.mode;
    S.mode = m;
    S.fade = 0;
  }

  /* --------------------------------------------------------- main switch */
  function setMains(on) {
    if (S.mains === on) return;
    S.mains = on;
    // lights come back one after another, like they do
    M.houses.forEach(function (h, i) { S.wait[h.id] = on && !reduceMotion ? 0.12 + i * 0.12 : 0; });
    if (!S.storm && S.taps < 4 && !S.asleep) setTip(on ? TAP + ' a house' : 'Flick the main switch');
    syncSwitch();
    redraw();
    kick();
  }
  function syncSwitch() {
    var tripped = !!(S.storm && S.storm.tripped && !S.storm.over);
    switchBtn.setAttribute('aria-pressed', String(S.mains));
    switchBtn.setAttribute('aria-label', 'Main switch: ' + (tripped ? 'tripped, press to reset' : S.mains ? 'on' : 'off'));
    switchBtn.classList.toggle('is-tripped', tripped);
    switchLabel.classList.toggle('tape-red', tripped);
    switchLabel.textContent = tripped ? 'Tripped! Flick it' : S.mains ? 'Main switch · on' : 'Main switch · off';
  }

  function onSwitch() {
    var st = S.storm;
    var now = performance.now();
    S.flicks = S.flicks.filter(function (t) { return now - t < 6000; });
    S.flicks.push(now);
    if (st) {
      if (st.over) return;
      if (!st.tripped) { toast('Leave the main on — the storm’s doing enough.'); return; }
      st.tripped = false;
      st.trippedFor = 0;
      st.shown = null;
      st.next = 0.8;
      st.nextTrip = rand(8, 11);
      setMains(true);
      setTip(TAP + ' the dark houses');
      track('game_switch', { on: true, storm: true });
      return;
    }
    setMains(!S.mains);
    track('game_switch', { on: S.mains });
    if (S.asleep) { ringPhone(); return; }
    if (S.flicks.length >= 12) {
      S.flicks = [];
      S.mac.state = 'look';
      S.mac.t = 2.2;
      say('Oi. Easy on the switch.', 2.4);
    } else if (S.mains && S.mac.state !== 'look') {
      if (S.mac.job === 'meter') { S.mac.job = null; S.mac.hurry = false; rest(0.6); }
      if (S.mac.state === 'idle') { S.mac.state = 'wave'; S.mac.t = 1.4; }
      say('Too easy.', 1.6);
      if (S.taps < 4) setTip(TAP + ' a house');
    }
    draw();
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

  function snapshot() {
    var h = {};
    Object.keys(S.house).forEach(function (k) { h[k] = Object.assign({}, S.house[k]); });
    return { mode: S.mode, mains: S.mains, house: h };
  }

  function startStorm() {
    q('[data-intro]').hidden = true;
    q('[data-results]').hidden = true;
    if (S.asleep) { S.asleep = false; S.mac.state = 'idle'; }
    if (!S.saved) S.saved = snapshot();
    S.storm = { left: STORM_LEN, next: 0.9, nextTrip: rand(8, 10), score: 0, over: false, queued: null, tripped: false, trippedFor: 0, shown: null };
    setMode('storm');
    S.mains = true;
    M.houses.forEach(function (h) { var x = hs(h.id); x.light = 'ok'; x.off = false; });
    var mac = S.mac;
    mac.job = null; mac.kind = null; mac.carry = null; mac.want = null; mac.hurry = false;
    rest(0);
    q('[data-hud-place]').hidden = true;
    q('[data-storm]').hidden = true;
    q('[data-hud-time]').hidden = false;
    q('[data-hud-score]').hidden = false;
    q('[data-quit]').hidden = false;
    q('[data-hud-power]').hidden = false;
    syncSwitch();
    setTip(TAP + ' the dark houses');
    updateStormHud();
    track('game_storm_start');
    kick();
  }

  function bolt(x, bottom) {
    var y = 0, pts = [[Math.round(x), 0]];
    while (y < bottom) { y += rand(4, 8); x += rand(-4, 4); pts.push([Math.round(x), Math.round(Math.min(y, bottom))]); }
    S.bolts.push({ pts: pts, t: 0.22 });
    if (!reduceMotion) S.flash = 0.5;
    if (navigator.vibrate && !reduceMotion) { try { navigator.vibrate(30); } catch (e) {} }
  }

  function strike() {
    var st = S.storm;
    var progress = 1 - st.left / STORM_LEN;
    st.next = 2.1 - 1.15 * progress + rand(0, 0.5);
    var mac = S.mac;
    var targets = M.houses.filter(function (h) { return hs(h.id).light === 'ok' && !(mac.state === 'work' && mac.job === h.id); });
    if (!targets.length) return;
    var h = pick(targets);
    hs(h.id).light = 'storm';
    S.flicker[h.id] = 0;
    bolt(h.door + rand(-12, 12), h.y - 4);
    if (M.houses.every(function (x) { return hs(x.id).light !== 'ok'; })) endStorm('blackout');
  }

  // A big one hits the line: the whole street's main switch trips.
  function trip() {
    var st = S.storm;
    st.tripped = true;
    st.trippedFor = 0;
    st.shown = null;
    var pole = pick(M.poles);
    bolt(pole + 1, 36);
    if (!reduceMotion) S.flash = 0.9;
    S.mains = false;
    syncSwitch();
    track('game_storm_trip');
  }

  function updateStormHud() {
    var st = S.storm;
    if (!st) return;
    setText('[data-hud-time] b', '0:' + String(Math.max(0, Math.ceil(st.left))).padStart(2, '0'));
    setText('[data-hud-score] b', String(st.score));
    var pw = q('[data-hud-power]');
    var n = M.houses.length, on = M.houses.filter(function (h) { return lightOn(h.id); }).length;
    if (pw.children.length !== n) { pw.innerHTML = ''; for (var i = 0; i < n; i++) pw.appendChild(document.createElement('i')); }
    for (var k = 0; k < n; k++) pw.children[k].className = k < on ? 'on' : '';
  }

  function endStorm(reason) {
    var st = S.storm;
    if (!st || st.over) return;
    st.over = true;
    hideEdges();
    syncSwitch();
    setTip('');
    track('game_storm_end', { score: st.score, reason: reason });
    setTimeout(function () {
      var n = st.score;
      setText('[data-res-tape]', reason === 'blackout' ? (st.tripped ? 'Blackout! The main stayed off' : 'Blackout! Round over') : 'Storm Night · round over');
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
    var saved = S.saved || { mode: 'dusk', mains: true, house: S.house };
    S.saved = null;
    setMode(saved.mode === 'storm' ? 'dusk' : saved.mode);
    S.house = saved.house;
    S.mains = saved.mains;
    var mac = S.mac;
    mac.job = null; mac.kind = null; mac.carry = null; mac.want = null; mac.hurry = false;
    q('[data-hud-place]').hidden = false;
    q('[data-storm]').hidden = false;
    q('[data-hud-time]').hidden = true;
    q('[data-hud-score]').hidden = true;
    q('[data-quit]').hidden = true;
    q('[data-hud-power]').hidden = true;
    hideEdges();
    syncSwitch();
    setTip(S.mains ? TAP + ' a house' : 'Flick the main switch');
    rest(0.5);
    redraw();
    kick();
  }

  function updateEdges() {
    var left = 0, right = 0;
    M.houses.forEach(function (h) {
      if (hs(h.id).light !== 'storm') return;
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
    switchBtn.addEventListener('click', onSwitch);
    q('[data-storm]').addEventListener('click', openIntro);
    q('[data-go]').addEventListener('click', startStorm);
    q('[data-cancel]').addEventListener('click', function () { q('[data-intro]').hidden = true; });
    q('[data-quit]').addEventListener('click', function () { if (S.storm) { S.storm.over = true; } leaveStorm(); });
    q('[data-again]').addEventListener('click', function () { S.storm = null; startStorm(); });
    q('[data-done]').addEventListener('click', leaveStorm);
    q('[data-share]').addEventListener('click', share);
    q('[data-beat-go]').addEventListener('click', openIntro);
    Array.prototype.forEach.call(stage.querySelectorAll('[data-edge]'), function (b) {
      b.addEventListener('click', function () {
        var side = parseInt(b.getAttribute('data-edge'), 10);
        var h = nearestJob(S.mac.x, side);
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
      return;
    }
    // Mac
    if (Math.abs(wx - mac.x) < 9 && wy > path - 27 && wy < path + 2 && !S.storm) {
      if (mac.state === 'idle' || mac.state === 'wave' || (mac.state === 'walk' && mac.then === 'stroll')) {
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
      say('Beep beep!', 1.2, 'ute');
      redraw();
      kick();
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
    var mac = S.mac, x = hs(h.id);
    if (S.asleep) { ringPhone(); return; }
    if (S.storm) {
      if (S.storm.over) return;
      if (x.light !== 'storm') {
        if (S.storm.tripped) say('It’s the main, mate. Flick the switch!', 1.8);
        return;
      }
      if (mac.state === 'work') { S.storm.queued = h.id; return; }
      mac.job = h.id;
      goTo(h.door, 'work');
      return;
    }
    var kind = jobAt(h.id);
    if (!kind) {
      // nothing wrong here: it's the residents' own light switch
      if (!S.mains) { say('Power’s off, mate. Flick the main switch.', 2); return; }
      x.off = !x.off;
      flick(h.id);
      redraw();
      return;
    }
    if (reduceMotion) {
      if (kind === 'globe') x.light = 'ok';
      if (kind === 'install' || kind === 'service') x.ac = 'ok';
      draw();
      return;
    }
    // something needs fixing: Mac makes it his next job
    S.priority = h.id;
    mac.hurry = true;
    if (mac.state === 'work' || mac.state === 'pickup' || mac.job === 'meter') return; // he'll come next
    mac.job = h.id;
    think();
  }

  function ringPhone() {
    if (S.wakeT > 0) return;
    say('Brrring brrring…', 1.4);
    S.wakeT = 1.5;
    kick();
  }
  function wakeUp() {
    S.asleep = false;
    S.mac.state = 'idle';
    S.mac.t = 1.8;
    say(S.mains ? 'MGR, Mac speaking.' : 'MGR, Mac speaking. Power’s out? On my way.', 2.6);
    setTip(S.mains ? TAP + ' a house' : 'Flick the main switch');
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
    if (S.wait[id] > 0) return false;
    var f = S.flicker[id];
    if (f > 0 && Math.floor(f * 26) % 2 === 0) return !lightOn(id);
    return lightOn(id);
  }
  function drawScene(mode) {
    wctx.drawImage(IMG['bg-' + mode], 0, 0);
    var lit = IMG['lit-' + mode];
    M.houses.forEach(function (h) {
      if (litShown(h.id)) wctx.drawImage(lit, h.x, h.y, h.w, h.h, h.x, h.y, h.w, h.h);
    });
  }

  function drawPower() {
    var spin = Math.floor(clock / 0.09) % 2 ? 'condenser-a' : 'condenser-b';
    M.houses.forEach(function (h, i) {
      var x = hs(h.id), running = acRunning(h.id);
      // outdoor unit (none until Mac installs one)
      if (x.ac !== 'none') sprite(running ? spin : 'condenser', h.cond[0] - 1, h.cond[1] - 1);
      // head units: blue light + air when running, red flashing light when playing up
      h.heads.forEach(function (u, k) {
        if (running) {
          wctx.fillStyle = '#3FA9E0';
          wctx.fillRect(u[0] + 7, u[1], 1, 1);
          wctx.fillStyle = AIR[x.air];
          for (var s = 0; s < 3; s++) {
            var ph = (clock * 0.9 + s / 3 + i * 0.37 + k * 0.21) % 1;
            if (reduceMotion) ph = 0.25 + s * 0.2;
            wctx.globalAlpha = 1 - ph * 0.6;
            var ax = u[0] + 1 + s * 3 + (ph > 0.5 ? (s % 2 ? 1 : -1) : 0);
            wctx.fillRect(Math.round(ax), Math.round(u[1] + 5 + ph * 6), 2, 1);
          }
          wctx.globalAlpha = 1;
        } else if (x.ac === 'fault' && S.mains && Math.floor(clock * 2.5) % 2 === 0) {
          wctx.fillStyle = '#FF4A3A';
          wctx.fillRect(u[0] + 7, u[1], 1, 1);
        }
      });
    });
    // streetlights
    if (S.mains) {
      var g = frameRect('glow-street');
      M.streetlights.forEach(function (l) {
        sprite('glow-street', l[2] - (g.w - 1) / 2, l[3] - (g.h - 1) / 2);
        wctx.fillStyle = '#FFE6A0';
        wctx.fillRect(l[0], l[1], 1, 1);
      });
    }
  }

  function drawIcons() {
    if (S.asleep) return;
    var bob = reduceMotion ? 0 : Math.floor(clock * 2) % 2;
    M.houses.forEach(function (h) {
      var kind = jobAt(h.id);
      if (!kind) return;
      // aircon jobs only make sense to show once there's power to test with
      if ((kind === 'install' || kind === 'service') && !S.mains) return;
      var name = kind === 'globe' ? 'icon-globe' : kind === 'storm' ? 'icon-storm' : 'icon-ac';
      var f = frameRect(name);
      sprite(name, h.door - (f.w - 1) / 2, h.y - f.h - 3 - bob);
    });
  }

  function macSprite() {
    var mac = S.mac;
    var step = Math.floor(mac.anim / 0.14) % 2;
    if (mac.state === 'wave') return 'mac-wave';
    if (mac.state === 'look') return 'mac-look';
    if (mac.state === 'work') {
      var alt = Math.floor(mac.anim / 0.25) % 2;
      if (mac.kind === 'globe') return alt ? 'mac-bulb' : 'mac-idle';
      if (mac.kind === 'install') return mac.t > 0.9 ? 'mac-box' : 'mac-idle';
      return 'mac-idle';
    }
    var carry = mac.carry === 'box' ? 'box' : mac.carry === 'globe' ? 'bulb' : '';
    if (mac.state === 'walk' && step) return carry ? 'mac-' + carry + 'walk' : 'mac-walk';
    return carry ? 'mac-' + carry : 'mac-idle';
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
    drawPower();

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
    if (mac.state === 'work' && mac.job && mac.job !== 'meter' && (S.mode !== 'dusk' || !S.mains)) {
      var h = HOUSE[mac.job], g = frameRect('glow-torch');
      sprite('glow-torch', h.door - g.w / 2, h.y + h.h - 22);
    }
    // Mac
    if (mac.state === 'sleep') {
      sprite('swag', mac.x - 14, path - 5);
      sprite('mac-sleep', mac.x - 12, path - 9);
    } else {
      var name = macSprite(), f = frameRect(name);
      sprite(name, mac.x - f.w / 2, path - f.h, mac.dir < 0 && mac.state !== 'look' && mac.state !== 'work');
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
    drawIcons();
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
    redraw();
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
  function track(event, data) {
    window.dataLayer = window.dataLayer || [];
    var o = { event: event };
    if (data) Object.keys(data).forEach(function (k) { o[k] = data[k]; });
    window.dataLayer.push(o);
  }
})();
