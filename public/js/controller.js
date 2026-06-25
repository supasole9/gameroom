/* global io */
const socket = io();

const $ = (id) => document.getElementById(id);
const joinScreen = $('joinScreen');
const playScreen = $('playScreen');
const controlsEl = $('controls');
const netStatus = $('netStatus');

// Stable per-device identity so a sleeping phone keeps its avatar + score.
function getClientId() {
  let id = localStorage.getItem('arcadeClientId');
  if (!id) {
    id = (crypto.randomUUID && crypto.randomUUID()) || ('c' + Date.now() + Math.random().toString(36).slice(2));
    localStorage.setItem('arcadeClientId', id);
  }
  return id;
}
const clientId = getClientId();

let joined = false;
let savedJoin = JSON.parse(localStorage.getItem('arcadeJoin') || 'null');

// Prefill the form if we played recently.
if (savedJoin) {
  $('code').value = savedJoin.code || '';
  $('name').value = savedJoin.name || '';
}

// ---------- Join ----------
function tryJoin() {
  const code = $('code').value.trim().toUpperCase();
  const name = $('name').value.trim() || 'Player';
  if (code.length < 4) {
    $('joinError').textContent = 'Type the 4-letter code from the TV.';
    return;
  }
  $('joinError').textContent = '';
  savedJoin = { code, name };
  socket.emit('player:join', { code, name, clientId });
}
$('joinBtn').addEventListener('click', tryJoin);
$('code').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase(); });
$('name').addEventListener('keydown', (e) => { if (e.key === 'Enter') tryJoin(); });

socket.on('controller:joined', ({ name, avatar, code }) => {
  joined = true;
  localStorage.setItem('arcadeJoin', JSON.stringify({ code, name }));
  $('youAv').textContent = avatar;
  $('youName').textContent = name;
  joinScreen.classList.add('hide');
  playScreen.classList.remove('hide');
});

socket.on('controller:error', ({ text }) => {
  if (!joined) {
    $('joinError').textContent = text;
  } else {
    // The TV closed the room (or we were removed). Stop auto-rejoining.
    joined = false;
    savedJoin = null;
    localStorage.removeItem('arcadeJoin');
    showWaiting('👋 ' + text, 'Tap below to join a new game.');
    controlsEl.innerHTML = '';
    const b = document.createElement('button');
    b.className = 'btn';
    b.textContent = 'Back to start';
    b.addEventListener('click', () => location.reload());
    controlsEl.appendChild(b);
  }
});

socket.on('controller:lobby', ({ phase }) => {
  if (phase === 'lobby') {
    showWaiting("You're in! 🎉", 'Look at the TV and pick a game…');
  }
});

function showWaiting(title, sub) {
  $('ctrlTitle').textContent = title;
  $('ctrlSub').textContent = sub || '';
  controlsEl.innerHTML = '';
}

// ---------- Connection status + auto-rejoin ----------
socket.on('connect', () => {
  netStatus.classList.add('hide');
  // If we were playing, silently reclaim our slot after a drop/sleep.
  if (savedJoin) {
    socket.emit('player:join', { code: savedJoin.code, name: savedJoin.name, clientId });
  }
});
socket.on('disconnect', () => {
  if (joined) {
    netStatus.textContent = '📡 Reconnecting…';
    netStatus.classList.remove('hide');
  }
});

// ---------- Declarative controller views ----------
socket.on('controller:view', (view) => renderView(view));

function renderView(view) {
  $('ctrlTitle').textContent = view.title || '';
  $('ctrlSub').textContent = view.subtitle || '';
  controlsEl.innerHTML = '';

  for (const c of (view.controls || [])) {
    controlsEl.appendChild(buildControl(c));
  }

  if (view.flash === 'wrong') {
    playScreen.classList.remove('flash-wrong');
    void playScreen.offsetWidth; // restart animation
    playScreen.classList.add('flash-wrong');
  }
}

function send(control, value) {
  socket.emit('player:action', { control, value });
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

  if (c.type === 'draw') {
    return buildDrawPad(c.id);
  }

  return document.createElement('div');
}

// ---------- Drawing pad ----------
function buildDrawPad() {
  const wrap = document.createElement('div');
  wrap.className = 'pad-wrap';
  const canvas = document.createElement('canvas');
  canvas.className = 'pad';
  // Fixed internal resolution; CSS scales it to the phone width.
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
    return {
      x: (t.clientX - r.left) / r.width,   // normalized 0..1
      y: (t.clientY - r.top) / r.height,
    };
  };
  const toPx = (p) => ({ x: p.x * canvas.width, y: p.y * canvas.height });

  const start = (e) => { e.preventDefault(); drawing = true; last = pos(e); };
  const move = (e) => {
    if (!drawing) return;
    e.preventDefault();
    const p = pos(e);
    const a = toPx(last), b = toPx(p);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
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
