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
let takenSet = new Set();         // emojis already used in the room
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
socket.on('controller:joined', ({ seats, palette: pal }) => {
  joined = true;
  mySeats = seats || [];
  if (pal) palette = pal;
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

// Lobby/waiting screen with an emoji picker for each of this phone's players.
function renderLobby() {
  renderSeatBar(new Set());
  $('ctrlTitle').textContent = "You're in! 🎉";
  $('ctrlSub').textContent = 'Tap to pick your emoji, then watch the TV…';
  runCleanups();
  controlsEl.innerHTML = '';
  for (const seat of mySeats) {
    const block = document.createElement('div');
    block.className = 'seat-edit';
    const label = document.createElement('div');
    label.className = 'seat-edit-name';
    label.innerHTML = `<span class="big-av">${seat.avatar || '🎮'}</span> ${seat.name}`;
    block.appendChild(label);
    const grid = document.createElement('div');
    grid.className = 'emoji-pick';
    for (const emo of palette) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'emoji-opt' + (emo === seat.avatar ? ' selected' : '');
      b.textContent = emo;
      if (takenSet.has(emo) && emo !== seat.avatar) {
        b.disabled = true;
      } else {
        b.addEventListener('click', () => socket.emit('player:setAvatar', { pid: seat.pid, avatar: emo }));
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

function renderAll() {
  const entries = mySeats.map((s) => seatViews.get(s.pid)).filter(Boolean);
  if (!entries.length) return;

  const activeSet = new Set(entries.filter((e) => isInteractive(e.view)).map((e) => e.seat.pid));

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

function renderSeatBar(activeSet) {
  seatBar.innerHTML = '';
  if (mySeats.length === 0) return;
  for (const s of mySeats) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'seat-chip'
      + (activeSet.has(s.pid) ? ' active' : '')
      + (s.pid === shownPid ? ' shown' : '');
    chip.innerHTML = `<span class="av">${s.avatar || '🎮'}</span><span>${s.name}</span>`;
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
      b.className = 'choice';
      b.textContent = (opt.emoji ? opt.emoji + ' ' : '') + opt.label;
      b.addEventListener('click', () => send(c.id, opt.id));
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
  if (c.type === 'draw') return buildDrawPad();
  if (c.type === 'timing') return buildTiming(c);
  if (c.type === 'flick') return buildFlick(c);
  if (c.type === 'reaction') return buildReaction(c);
  return document.createElement('div');
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
