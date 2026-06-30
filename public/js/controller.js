/* global io */
const socket = io();

const $ = (id) => document.getElementById(id);
const joinScreen = $('joinScreen');
const playScreen = $('playScreen');
const controlsEl = $('controls');
const netStatus = $('netStatus');
const seatBar = $('seatBar');

// Stable per-device identity, and per-seat ids, so a sleeping phone keeps its
// players (with avatars + scores).
function getClientId() {
  let id = localStorage.getItem('arcadeClientId');
  if (!id) {
    id = (crypto.randomUUID && crypto.randomUUID()) || ('c' + Date.now() + Math.random().toString(36).slice(2));
    localStorage.setItem('arcadeClientId', id);
  }
  return id;
}
const clientId = getClientId();
const newPid = () => clientId + '-' + Math.random().toString(36).slice(2, 8);

let joined = false;
let savedSeats = JSON.parse(localStorage.getItem('arcadeSeats') || 'null'); // [{pid,name}]
let savedCode = localStorage.getItem('arcadeCode') || '';

let mySeats = [];                 // authoritative seats from the server [{pid,name,avatar}]
const seatViews = new Map();      // pid -> { seat, view }
let shownPid = null;              // seat currently displayed
let actingPid = null;             // seat an action will be attributed to
let palette = [];                 // available emojis to pick from
let characters = [];              // uploaded character images usable as avatars
let takenSet = new Set();         // avatars already used in the room
// An avatar is an emoji string, or an uploaded image token "img:<url>".
function avatarMarkup(av) {
  if (typeof av === 'string' && av.startsWith('img:')) return `<img class="av-img" src="${av.slice(4)}" alt="">`;
  return av || '🎮';
}
let currentScreen = 'join';       // 'join' | 'lobby' | 'game'
let padClear = null;              // clears the local drawing pad, if one is shown
let cleanups = [];               // teardown for active widgets (timers/animation frames)
function runCleanups() { cleanups.forEach((fn) => { try { fn(); } catch (e) { /* ignore */ } }); cleanups = []; }

// ---------- Join screen: dynamic name rows ----------
function addNameRow(name = '') {
  if ($('nameRows').children.length >= 6) return;
  const row = document.createElement('div');
  row.className = 'name-row';
  const inp = document.createElement('input');
  inp.type = 'text'; inp.maxLength = 14; inp.placeholder = 'e.g. Maya'; inp.value = name;
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') tryJoin(); });
  const rm = document.createElement('button');
  rm.type = 'button'; rm.className = 'name-rm'; rm.textContent = '✕';
  rm.addEventListener('click', () => { row.remove(); updateRmButtons(); });
  row.appendChild(inp); row.appendChild(rm);
  $('nameRows').appendChild(row);
  updateRmButtons();
}
function updateRmButtons() {
  const rows = [...$('nameRows').children];
  rows.forEach((r) => { r.querySelector('.name-rm').style.visibility = rows.length > 1 ? 'visible' : 'hidden'; });
}
function nameRowValues() {
  return [...$('nameRows').querySelectorAll('input')].map((i) => i.value.trim()).filter(Boolean);
}

// seed rows from saved seats (or one empty row)
if (savedSeats && savedSeats.length) { savedSeats.forEach((s) => addNameRow(s.name)); }
else { addNameRow(''); }
if (savedCode) $('code').value = savedCode;

$('addPlayer').addEventListener('click', () => addNameRow(''));
$('code').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase(); });

function buildSeats(names) {
  // Reuse existing pids/avatars by position so reconnection keeps choices.
  return names.map((name, i) => {
    const prev = savedSeats && savedSeats[i];
    return { pid: (prev && prev.pid) || newPid(), name, avatar: prev && prev.avatar };
  });
}

function tryJoin() {
  const code = $('code').value.trim().toUpperCase();
  const names = nameRowValues();
  if (code.length < 4) { $('joinError').textContent = 'Type the 4-letter code from the TV.'; return; }
  if (!names.length) { $('joinError').textContent = 'Add at least one player name.'; return; }
  $('joinError').textContent = '';
  savedSeats = buildSeats(names);
  savedCode = code;
  localStorage.setItem('arcadeSeats', JSON.stringify(savedSeats));
  localStorage.setItem('arcadeCode', code);
  socket.emit('player:join', { code, clientId, seats: savedSeats });
}
$('joinBtn').addEventListener('click', tryJoin);

// ---------- Join result ----------
socket.on('controller:joined', ({ seats, palette: pal, characters: chars }) => {
  joined = true;
  mySeats = seats || [];
  if (pal) palette = pal;
  if (chars) characters = chars;
  persistSeats();
  joinScreen.classList.add('hide');
  playScreen.classList.remove('hide');
  renderSeatBar(new Set());
});

function persistSeats() {
  savedSeats = mySeats.map((s) => ({ pid: s.pid, name: s.name, avatar: s.avatar }));
  localStorage.setItem('arcadeSeats', JSON.stringify(savedSeats));
}

// Server confirms updated seats (e.g. after an emoji change).
socket.on('controller:seats', ({ seats }) => {
  const byPid = new Map((seats || []).map((s) => [s.pid, s]));
  mySeats = mySeats.map((s) => byPid.get(s.pid) || s);
  persistSeats();
  if (currentScreen === 'lobby') renderLobby();
  else renderSeatBar(new Set(mySeats.filter((s) => isInteractive((seatViews.get(s.pid) || {}).view || {})).map((s) => s.pid)));
});

// Which emojis are taken across the room (so pickers disable them).
socket.on('controller:roster', ({ taken }) => {
  takenSet = new Set(taken || []);
  if (currentScreen === 'lobby') renderLobby();
});

socket.on('controller:error', ({ text }) => {
  if (!joined) { $('joinError').textContent = text; return; }
  joined = false; savedSeats = null;
  localStorage.removeItem('arcadeSeats');
  showWaiting('👋 ' + text, 'Tap below to join a new game.');
  controlsEl.innerHTML = '';
  const b = document.createElement('button');
  b.className = 'btn'; b.textContent = 'Back to start';
  b.addEventListener('click', () => location.reload());
  controlsEl.appendChild(b);
});

socket.on('controller:removed', ({ pid }) => {
  mySeats = mySeats.filter((s) => s.pid !== pid);
  seatViews.delete(pid);
  savedSeats = (savedSeats || []).filter((s) => s.pid !== pid);
  localStorage.setItem('arcadeSeats', JSON.stringify(savedSeats));
  if (!mySeats.length) location.reload();
  else renderAll();
});

socket.on('controller:lobby', ({ phase }) => {
  if (phase === 'lobby') { currentScreen = 'lobby'; seatViews.clear(); renderLobby(); }
  else { currentScreen = 'game'; }
});

// Lobby/waiting screen with an avatar picker (emojis + uploaded characters).
function renderLobby() {
  renderSeatBar(new Set());
  $('ctrlTitle').textContent = "You're in! 🎉";
  $('ctrlSub').textContent = 'Pick your look, then watch the TV…';
  runCleanups();
  controlsEl.innerHTML = '';

  // emojis, then uploaded character images
  const options = [
    ...palette.map((emo) => ({ id: emo, emoji: emo })),
    ...characters.map((c) => ({ id: c.token, img: c.url })),
  ];

  for (const seat of mySeats) {
    const block = document.createElement('div');
    block.className = 'seat-edit';
    const label = document.createElement('div');
    label.className = 'seat-edit-name';
    label.innerHTML = `<span class="big-av">${avatarMarkup(seat.avatar)}</span> ${seat.name}`;
    block.appendChild(label);

    const grid = document.createElement('div');
    grid.className = 'emoji-pick';
    for (const opt of options) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'emoji-opt' + (opt.id === seat.avatar ? ' selected' : '') + (opt.img ? ' img-opt' : '');
      if (opt.img) { const im = document.createElement('img'); im.src = opt.img; im.alt = ''; b.appendChild(im); }
      else b.textContent = opt.emoji;
      if (takenSet.has(opt.id) && opt.id !== seat.avatar) {
        b.disabled = true;
      } else {
        b.addEventListener('click', () => socket.emit('player:setAvatar', { pid: seat.pid, avatar: opt.id }));
      }
      grid.appendChild(b);
    }
    block.appendChild(grid);
    controlsEl.appendChild(block);
  }
}

socket.on('controller:toast', ({ text }) => { $('ctrlSub').textContent = text; });

function showWaiting(title, sub) {
  $('ctrlTitle').textContent = title;
  $('ctrlSub').textContent = sub || '';
  controlsEl.innerHTML = '';
}

// ---------- Connection status + auto-rejoin ----------
socket.on('connect', () => {
  netStatus.classList.add('hide');
  if (savedSeats && savedSeats.length && savedCode) {
    socket.emit('player:join', { code: savedCode, clientId, seats: savedSeats });
  }
});
socket.on('disconnect', () => {
  if (joined) { netStatus.textContent = '📡 Reconnecting…'; netStatus.classList.remove('hide'); }
});

// ---------- Per-seat views ----------
const isInteractive = (view) => (view.controls || []).some((c) => c.type !== 'text');

socket.on('controller:view', ({ seat, view }) => {
  seatViews.set(seat.pid, { seat, view });
  renderAll();
});

const isBuzzView = (view) => (view.controls || []).length > 0
  && (view.controls || []).every((c) => c.type === 'buzz');

function renderAll() {
  const entries = mySeats.map((s) => seatViews.get(s.pid)).filter(Boolean);
  if (!entries.length) return;

  const activeSet = new Set(entries.filter((e) => isInteractive(e.view)).map((e) => e.seat.pid));

  // Split buzz: 2+ seats on this phone are all showing a buzz button at once.
  const buzzEntries = entries.filter((e) => activeSet.has(e.seat.pid) && isBuzzView(e.view));
  if (buzzEntries.length > 1 && buzzEntries.length === activeSet.size) {
    currentScreen = 'game';
    renderSeatBar(activeSet);
    renderSplitBuzz(buzzEntries);
    return;
  }

  let pick;
  if (entries.length === 1) pick = entries[0];
  else if (activeSet.size === 1) pick = entries.find((e) => activeSet.has(e.seat.pid));
  else if (activeSet.size > 1) pick = entries.find((e) => e.seat.pid === shownPid && activeSet.has(e.seat.pid)) || entries.find((e) => activeSet.has(e.seat.pid));
  else pick = entries.find((e) => e.seat.pid === shownPid) || entries[0];

  currentScreen = 'game';
  shownPid = pick.seat.pid;
  actingPid = pick.seat.pid;
  renderSeatBar(activeSet);
  renderView(pick.view, pick.seat);
}

// One big buzz button per local seat, stacked — two people can hold opposite
// ends of the phone and race. Each button attributes the buzz to its own seat.
function renderSplitBuzz(entries) {
  $('ctrlTitle').textContent = 'Read the TV — BUZZ!';
  $('ctrlSub').textContent = 'Each player taps their own side.';
  runCleanups();
  controlsEl.innerHTML = '';
  padClear = null;
  const wrap = document.createElement('div');
  wrap.className = 'split-buzz';
  for (const e of entries) {
    const b = document.createElement('button');
    b.className = 'btn buzz-btn split';
    b.innerHTML = `<span class="split-name">${avatarMarkup(e.seat.avatar)} ${e.seat.name}</span><span class="split-label">🔴 BUZZ</span>`;
    b.addEventListener('click', () => sendAs(e.seat.pid, 'buzz', true));
    wrap.appendChild(b);
  }
  controlsEl.appendChild(wrap);
}

function renderSeatBar(activeSet) {
  seatBar.innerHTML = '';
  if (mySeats.length === 0) return;
  for (const s of mySeats) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'seat-chip'
      + (activeSet.has(s.pid) ? ' active' : '')
      + (s.pid === shownPid ? ' shown' : '');
    chip.innerHTML = `<span class="av">${avatarMarkup(s.avatar)}</span><span>${s.name}</span>`;
    if (activeSet.size > 1 && activeSet.has(s.pid)) {
      chip.addEventListener('click', () => { shownPid = s.pid; renderAll(); });
    } else {
      chip.disabled = true;
    }
    seatBar.appendChild(chip);
  }
}

function renderView(view, seat) {
  // When sharing a phone, make it obvious whose controls these are.
  const prefix = mySeats.length > 1 ? `${seat.avatar} ${seat.name} — ` : '';
  $('ctrlTitle').textContent = (prefix && view.title ? prefix : '') + (view.title || '');
  $('ctrlSub').textContent = view.subtitle || '';
  runCleanups();
  controlsEl.innerHTML = '';
  padClear = null; // rebuilt by buildDrawPad if this view has a pad
  for (const c of (view.controls || [])) controlsEl.appendChild(buildControl(c));

  if (view.flash === 'wrong') {
    playScreen.classList.remove('flash-wrong');
    void playScreen.offsetWidth;
    playScreen.classList.add('flash-wrong');
  }
}

function send(control, value) {
  socket.emit('player:action', { pid: actingPid, control, value });
}

function sendAs(pid, control, value) {
  socket.emit('player:action', { pid, control, value });
}

function buildControl(c) {
  if (c.type === 'button') {
    const b = document.createElement('button');
    b.className = 'btn' + (c.big ? ' big' : '');
    if (c.color) b.style.background = c.color;
    b.textContent = c.label;
    b.addEventListener('click', () => {
      send(c.id, true);
      // The Clear button must also wipe the artist's own canvas, not just the TV.
      if (c.id === 'clear' && padClear) padClear();
    });
    return b;
  }
  if (c.type === 'text') {
    const d = document.createElement('div');
    d.className = 'ctrl-text';
    d.textContent = c.value;
    return d;
  }
  if (c.type === 'prompt') {
    const d = document.createElement('div');
    d.className = 'ctrl-prompt';
    d.textContent = c.value;
    return d;
  }
  if (c.type === 'choices') {
    const wrap = document.createElement('div');
    if (c.label) {
      const l = document.createElement('div');
      l.className = 'ctrl-sub';
      l.textContent = c.label;
      wrap.appendChild(l);
    }
    const grid = document.createElement('div');
    grid.className = 'choices' + (c.big ? ' big' : '');
    for (const opt of c.options) {
      const b = document.createElement('button');
      b.className = 'choice' + (c.selected != null && opt.id === c.selected ? ' selected' : '');
      if (opt.img) {
        b.classList.add('has-img');
        const im = document.createElement('img');
        im.className = 'choice-img'; im.src = opt.img; im.alt = '';
        const nm = document.createElement('span');
        nm.className = 'cname'; nm.textContent = opt.label;
        b.append(im, nm);
      } else {
        b.textContent = (opt.emoji ? opt.emoji + ' ' : '') + opt.label;
      }
      if (opt.disabled) b.disabled = true;
      else b.addEventListener('click', () => send(c.id, opt.id));
      grid.appendChild(b);
    }
    wrap.appendChild(grid);
    return wrap;
  }
  if (c.type === 'input') {
    const wrap = document.createElement('div');
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.placeholder = c.placeholder || '';
    inp.maxLength = 40;
    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.textContent = c.submitLabel || 'Send';
    const submit = () => {
      const v = inp.value.trim();
      if (v) { send(c.id, v); inp.value = ''; }
    };
    btn.addEventListener('click', submit);
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    wrap.appendChild(inp);
    wrap.appendChild(btn);
    return wrap;
  }
  if (c.type === 'buzz') {
    const b = document.createElement('button');
    b.className = 'btn buzz-btn';
    b.textContent = c.label || '🔴 BUZZ';
    b.addEventListener('click', () => send(c.id, true));
    return b;
  }
  if (c.type === 'draw') return buildDrawPad();
  if (c.type === 'timing') return buildTiming(c);
  if (c.type === 'flick') return buildFlick(c);
  if (c.type === 'reaction') return buildReaction(c);
  if (c.type === 'challenge') return buildChallenge(c);
  if (c.type === 'upload') return buildUpload(c);
  return document.createElement('div');
}

// A random, timed dodge challenge. Emits 'ok' (success), 'fail' (wrong), or
// 'toolate' (ran out of time). Reusable for any "react under pressure" moment.
function buildChallenge(c) {
  const wrap = document.createElement('div');
  wrap.className = 'mini reaction';
  const prompt = document.createElement('div');
  prompt.className = 'reaction-prompt';
  prompt.textContent = c.prompt || 'DODGE!';
  const barWrap = document.createElement('div');
  barWrap.className = 'reaction-bar';
  const bar = document.createElement('div');
  bar.className = 'reaction-fill';
  barWrap.appendChild(bar);
  const body = document.createElement('div');
  body.className = 'challenge-body';
  wrap.append(prompt, barWrap, body);

  let done = false, raf = 0;
  const ms = c.ms || 2200;
  function finish(val) { if (done) return; done = true; clearTimeout(timer); cancelAnimationFrame(raf); send(c.id, val); }
  const timer = setTimeout(() => finish('toolate'), ms);
  requestAnimationFrame(() => { bar.style.transition = `width ${ms}ms linear`; bar.style.width = '0%'; });

  if (c.kind === 'mash') {
    const need = c.taps || 5; let n = 0;
    const btn = document.createElement('button');
    btn.className = 'btn big'; btn.style.background = '#22c55e';
    const upd = () => { btn.textContent = `TAP FAST! ${n}/${need}`; };
    upd();
    btn.addEventListener('click', () => { if (done) return; n++; upd(); if (n >= need) finish('ok'); });
    body.appendChild(btn);
  } else if (c.kind === 'aim') {
    const row = document.createElement('div');
    row.className = 'choices';
    for (const d of ['⬅️', '⬆️', '➡️']) {
      const btn = document.createElement('button');
      btn.className = 'choice'; btn.textContent = d;
      btn.addEventListener('click', () => { if (done) return; finish(d === c.dir ? 'ok' : 'fail'); });
      row.appendChild(btn);
    }
    body.appendChild(row);
  } else if (c.kind === 'catch') {
    const box = document.createElement('div');
    box.className = 'catch-box';
    const target = document.createElement('button');
    target.className = 'catch-target'; target.textContent = '🎯';
    const need = c.hits || 2; let hits = 0;
    const place = () => { target.style.left = (8 + Math.random() * 74) + '%'; target.style.top = (8 + Math.random() * 64) + '%'; };
    target.addEventListener('click', () => { if (done) return; hits++; if (hits >= need) finish('ok'); else place(); });
    box.appendChild(target); body.appendChild(box); place();
  } else { // 'timing' — tap while the marker is near the middle
    const track = document.createElement('div');
    track.className = 'timing-track';
    track.innerHTML = '<div class="timing-green"></div><div class="timing-perfect"></div><div class="timing-marker"></div>';
    const marker = track.querySelector('.timing-marker');
    const btn = document.createElement('button');
    btn.className = 'btn big'; btn.style.background = '#22c55e'; btn.textContent = 'TAP!';
    body.append(track, btn);
    const dur = c.speed === 'hard' ? 800 : 1200;
    let startT = null;
    const frame = (t) => {
      if (done) return;
      if (startT === null) startT = t;
      const tri = Math.abs((((t - startT) / dur) % 2) - 1); // bounce 0..1..0
      marker.style.left = (tri * 100) + '%';
      raf = requestAnimationFrame(frame);
    };
    const grade = () => (Math.abs((parseFloat(marker.style.left) || 0) - 50) <= 22 ? 'ok' : 'fail');
    btn.addEventListener('click', () => finish(grade()));
    raf = requestAnimationFrame(frame);
  }

  cleanups.push(() => { done = true; clearTimeout(timer); cancelAnimationFrame(raf); });
  return wrap;
}

// ---------- Character image upload + editor ----------
function buildUpload(c) {
  const b = document.createElement('button');
  b.className = 'btn';
  b.style.background = c.color || '#7c5cff';
  b.textContent = c.label || '📷 Upload your own';
  b.addEventListener('click', () => openImageEditor(actingPid));
  return b;
}

function openImageEditor(pid) {
  const ov = document.createElement('div');
  ov.className = 'editor-overlay';
  ov.innerHTML = `
    <div class="editor">
      <div class="editor-title">Make your fighter 🥊</div>
      <div class="editor-hint">Aim them facing the ➡️ side. We flip the other player so you face each other.</div>
      <div class="editor-canvas-wrap">
        <canvas id="edCanvas" width="256" height="256"></canvas>
        <div class="editor-arrow">➡️</div>
      </div>
      <label class="editor-file"><input id="edFile" type="file" accept="image/*"> 📁 Choose a photo</label>
      <label class="editor-row">Size <input id="edScale" type="range" min="0.1" max="3" step="0.01" value="1"></label>
      <div class="editor-row btns">
        <button id="edRotL" class="btn-secondary" type="button">⟲ Turn</button>
        <button id="edRotR" class="btn-secondary" type="button">Turn ⟳</button>
        <button id="edFlip" class="btn-secondary" type="button">↔ Flip</button>
      </div>
      <div class="editor-row btns">
        <button id="edCancel" class="btn-secondary" type="button">Cancel</button>
        <button id="edUse" class="btn" type="button">Use this fighter ✅</button>
      </div>
    </div>`;
  document.body.appendChild(ov);

  const canvas = ov.querySelector('#edCanvas');
  const ctx = canvas.getContext('2d');
  let img = null, scale = 1, rot = 0, flip = 1, ox = 0, oy = 0;
  function draw() {
    ctx.clearRect(0, 0, 256, 256);
    // checker-ish backdrop so a transparent png is visible while editing
    ctx.fillStyle = 'rgba(255,255,255,.06)';
    ctx.fillRect(0, 0, 256, 256);
    if (!img) return;
    ctx.save();
    ctx.translate(128 + ox, 128 + oy);
    ctx.rotate(rot);
    ctx.scale(scale * flip, scale);
    ctx.drawImage(img, -img.width / 2, -img.height / 2);
    ctx.restore();
  }
  draw();

  ov.querySelector('#edFile').addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      const im = new Image();
      im.onload = () => {
        img = im;
        scale = Math.min(220 / im.width, 220 / im.height) || 1;
        rot = 0; flip = 1; ox = 0; oy = 0;
        ov.querySelector('#edScale').value = String(scale);
        draw();
      };
      im.src = r.result;
    };
    r.readAsDataURL(f);
  });
  ov.querySelector('#edScale').addEventListener('input', (e) => { scale = parseFloat(e.target.value); draw(); });
  ov.querySelector('#edRotL').addEventListener('click', () => { rot -= Math.PI / 12; draw(); });
  ov.querySelector('#edRotR').addEventListener('click', () => { rot += Math.PI / 12; draw(); });
  ov.querySelector('#edFlip').addEventListener('click', () => { flip *= -1; draw(); });

  let dragging = false, lx = 0, ly = 0;
  const pt = (e) => { const t = e.touches ? e.touches[0] : e; const r = canvas.getBoundingClientRect(); return { x: (t.clientX - r.left) * (256 / r.width), y: (t.clientY - r.top) * (256 / r.height) }; };
  const down = (e) => { dragging = true; const p = pt(e); lx = p.x; ly = p.y; };
  const moveH = (e) => { if (!dragging) return; const p = pt(e); ox += p.x - lx; oy += p.y - ly; lx = p.x; ly = p.y; draw(); if (e.cancelable) e.preventDefault(); };
  const up = () => { dragging = false; };
  canvas.addEventListener('mousedown', down);
  window.addEventListener('mousemove', moveH);
  window.addEventListener('mouseup', up);
  canvas.addEventListener('touchstart', (e) => { down(e); e.preventDefault(); }, { passive: false });
  canvas.addEventListener('touchmove', moveH, { passive: false });
  canvas.addEventListener('touchend', up);

  function close() {
    window.removeEventListener('mousemove', moveH);
    window.removeEventListener('mouseup', up);
    ov.remove();
  }
  ov.querySelector('#edCancel').addEventListener('click', close);
  ov.querySelector('#edUse').addEventListener('click', () => {
    if (img) socket.emit('player:setCharacterImage', { pid, dataUrl: canvas.toDataURL('image/png') });
    close();
  });
  cleanups.push(close);
}

// ---------- Reusable mini-game widgets ----------
// Tap-when-it's-green timing bar. Grades to 'perfect' | 'minor' | 'miss'.
function buildTiming(c) {
  const wrap = document.createElement('div');
  wrap.className = 'mini';
  const hint = document.createElement('div');
  hint.className = 'mini-hint';
  hint.textContent = c.label || "Tap when the marker is in the GREEN — middle is PERFECT!";
  const track = document.createElement('div');
  track.className = 'timing-track';
  track.innerHTML = '<div class="timing-green"></div><div class="timing-perfect"></div><div class="timing-marker"></div>';
  const marker = track.querySelector('.timing-marker');
  const btn = document.createElement('button');
  btn.className = 'btn big';
  btn.style.background = c.color || '#ff6b6b';
  btn.textContent = 'TAP!';
  wrap.append(hint, track, btn);

  const dur = c.speed === 'hard' ? 900 : 1500;
  let raf, startT = null, done = false;
  const setPos = (p) => { marker.style.left = (p * 100) + '%'; };
  function frame(t) {
    if (startT === null) startT = t;
    let p = (t - startT) / dur;
    if (p >= 1) { setPos(1); return finish('miss'); }
    setPos(p);
    raf = requestAnimationFrame(frame);
  }
  function grade() {
    const p = parseFloat(marker.style.left) || 0;
    const dist = Math.abs(p - 50);
    if (dist <= 7) return 'perfect';
    if (dist <= 22) return 'minor';
    return 'miss';
  }
  function finish(forced) {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    btn.disabled = true;
    send(c.id, forced || grade());
  }
  btn.addEventListener('click', () => finish());
  raf = requestAnimationFrame(frame);
  cleanups.push(() => { done = true; cancelAnimationFrame(raf); });
  return wrap;
}

// Flick/swipe up. Grades by distance + speed to 'perfect' | 'minor' | 'miss'.
function buildFlick(c) {
  const wrap = document.createElement('div');
  wrap.className = 'mini';
  const hint = document.createElement('div');
  hint.className = 'mini-hint';
  hint.textContent = c.label || 'FLICK UP fast to shoot! 🏹';
  const pad = document.createElement('div');
  pad.className = 'flick-pad';
  pad.textContent = '⬆️';
  wrap.append(hint, pad);

  let startY = null, startT = 0, done = false;
  const begin = (e) => { const t = e.touches ? e.touches[0] : e; startY = t.clientY; startT = performance.now(); e.preventDefault(); };
  const finishGesture = (e) => {
    if (done || startY === null) return;
    const t = e.changedTouches ? e.changedTouches[0] : e;
    const dy = startY - t.clientY;            // up is positive
    const speed = dy / Math.max(performance.now() - startT, 1);
    let q = 'miss';
    if (dy > 40) q = speed > 0.9 ? 'perfect' : 'minor';
    finish(q);
  };
  function finish(q) { if (done) return; done = true; pad.textContent = q === 'miss' ? '❌' : '💥'; send(c.id, q); }
  pad.addEventListener('mousedown', begin);
  window.addEventListener('mouseup', finishGesture);
  pad.addEventListener('touchstart', begin, { passive: false });
  pad.addEventListener('touchend', finishGesture);
  const timer = setTimeout(() => finish('miss'), 2600);
  cleanups.push(() => { done = true; clearTimeout(timer); window.removeEventListener('mouseup', finishGesture); });
  return wrap;
}

// Time-limited reaction: pick a button before the bar empties, else 'toolate'.
function buildReaction(c) {
  const wrap = document.createElement('div');
  wrap.className = 'mini reaction';
  const prompt = document.createElement('div');
  prompt.className = 'reaction-prompt';
  prompt.textContent = c.prompt || 'INCOMING! ⚡';
  const barWrap = document.createElement('div');
  barWrap.className = 'reaction-bar';
  const bar = document.createElement('div');
  bar.className = 'reaction-fill';
  barWrap.appendChild(bar);
  const btns = document.createElement('div');
  btns.className = 'controls';
  wrap.append(prompt, barWrap, btns);

  let done = false;
  function finish(val) { if (done) return; done = true; clearTimeout(timer); send(c.id, val); }
  for (const b of (c.buttons || [])) {
    const el = document.createElement('button');
    el.className = 'btn big';
    el.style.background = b.color || '#22c55e';
    el.textContent = b.label;
    el.addEventListener('click', () => finish(b.id));
    btns.appendChild(el);
  }
  const ms = c.ms || 1600;
  requestAnimationFrame(() => { bar.style.transition = `width ${ms}ms linear`; bar.style.width = '0%'; });
  const timer = setTimeout(() => finish('toolate'), ms);
  cleanups.push(() => { done = true; clearTimeout(timer); });
  return wrap;
}

// ---------- Drawing pad ----------
function buildDrawPad() {
  const wrap = document.createElement('div');
  wrap.className = 'pad-wrap';
  const canvas = document.createElement('canvas');
  canvas.className = 'pad';
  canvas.width = 600;
  canvas.height = 600;
  wrap.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  ctx.lineWidth = 10;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#222';

  let drawing = false;
  let last = null;
  const pos = (e) => {
    const r = canvas.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return { x: (t.clientX - r.left) / r.width, y: (t.clientY - r.top) / r.height };
  };
  const toPx = (p) => ({ x: p.x * canvas.width, y: p.y * canvas.height });
  const start = (e) => { e.preventDefault(); drawing = true; last = pos(e); };
  const move = (e) => {
    if (!drawing) return;
    e.preventDefault();
    const p = pos(e);
    const a = toPx(last), b = toPx(p);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    send('stroke', { from: last, to: p });
    last = p;
  };
  const end = () => { drawing = false; last = null; };
  padClear = () => ctx.clearRect(0, 0, canvas.width, canvas.height);
  canvas.addEventListener('mousedown', start);
  canvas.addEventListener('mousemove', move);
  window.addEventListener('mouseup', end);
  canvas.addEventListener('touchstart', start, { passive: false });
  canvas.addEventListener('touchmove', move, { passive: false });
  canvas.addEventListener('touchend', end);
  return wrap;
}
