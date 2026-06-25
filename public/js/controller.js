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
  // Reuse existing pids by position so reconnection keeps avatars/scores.
  return names.map((name, i) => ({ pid: (savedSeats && savedSeats[i] && savedSeats[i].pid) || newPid(), name }));
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
socket.on('controller:joined', ({ seats }) => {
  joined = true;
  mySeats = seats || [];
  // persist accepted seats (server is authoritative on which were allowed)
  savedSeats = mySeats.map((s) => ({ pid: s.pid, name: s.name }));
  localStorage.setItem('arcadeSeats', JSON.stringify(savedSeats));
  joinScreen.classList.add('hide');
  playScreen.classList.remove('hide');
  renderSeatBar(new Set());
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
  if (phase === 'lobby') { seatViews.clear(); showWaiting("You're in! 🎉", 'Look at the TV and pick a game…'); renderSeatBar(new Set()); }
});

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
  controlsEl.innerHTML = '';
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
    b.addEventListener('click', () => send(c.id, true));
    return b;
  }
  if (c.type === 'text') {
    const d = document.createElement('div');
    d.className = 'ctrl-text';
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
    grid.className = 'choices';
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
  return document.createElement('div');
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
  canvas.addEventListener('mousedown', start);
  canvas.addEventListener('mousemove', move);
  window.addEventListener('mouseup', end);
  canvas.addEventListener('touchstart', start, { passive: false });
  canvas.addEventListener('touchmove', move, { passive: false });
  canvas.addEventListener('touchend', end);
  return wrap;
}
