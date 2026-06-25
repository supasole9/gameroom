/* global io */
const socket = io();
const $ = (id) => document.getElementById(id);

const lobbyEl = $('lobby');
const gameViewEl = $('gameView');
const gameStage = $('gameStage');

let games = [];

// On load, this screen becomes the host/TV.
socket.on('connect', () => socket.emit('host:create'));

socket.on('host:created', ({ code, games: catalogue }) => {
  games = catalogue;
  $('roomCode').textContent = code;
  $('joinUrl').textContent = location.host;
  renderGamesGrid();
});

// ---------- Lobby ----------
socket.on('tv:lobby', ({ code, players, games: catalogue, phase }) => {
  if (code) $('roomCode').textContent = code;
  if (catalogue) games = catalogue;
  renderPlayers(players, $('playerList'));
  $('emptyHint').style.display = players.length ? 'none' : 'block';
  if (phase === 'lobby') showLobby();
  renderGamesGrid();
});

function showLobby() {
  lobbyEl.classList.remove('hide');
  gameViewEl.classList.add('hide');
  window.speechSynthesis && window.speechSynthesis.cancel();
}

function renderPlayers(players, target) {
  target.innerHTML = '';
  for (const p of players || []) {
    const tok = document.createElement('div');
    tok.className = 'player-tok';
    tok.dataset.id = p.id;
    tok.innerHTML = `<span class="av">${p.avatar}</span><span class="nm">${escapeHtml(p.name)}</span>`;
    target.appendChild(tok);
  }
}

function renderGamesGrid() {
  const grid = $('gamesGrid');
  grid.innerHTML = '';
  for (const g of games) {
    const card = document.createElement('div');
    card.className = 'game-card';
    card.innerHTML = `<div class="emo">${g.emoji}</div><div class="gname">${g.name}</div><div class="gblurb">${g.blurb}</div>`;
    card.addEventListener('click', () => {
      // A click is a user gesture — unlocks speech synthesis for narration.
      primeSpeech();
      socket.emit('host:selectGame', { gameId: g.id });
    });
    grid.appendChild(card);
  }
}

$('backBtn').addEventListener('click', () => socket.emit('host:arcade'));

// ---------- Game routing ----------
socket.on('tv:game', (payload) => {
  lobbyEl.classList.add('hide');
  gameViewEl.classList.remove('hide');
  renderScorebar(payload.players, payload);
  switch (payload.gameId) {
    case 'snakes': renderSnakes(payload); break;
    case 'story': renderStory(payload); break;
    case 'draw': renderDraw(payload); break;
  }
});

function renderScorebar(players, payload) {
  const bar = $('scorebar');
  bar.innerHTML = '';
  const activeId = activeTurnId(payload);
  for (const p of players || []) {
    const tok = document.createElement('div');
    tok.className = 'player-tok' + (p.id === activeId ? ' active-turn' : '');
    tok.innerHTML = `<span class="av">${p.avatar}</span><span class="nm">${escapeHtml(p.name)}</span><span class="sc">${p.score}⭐</span>`;
    bar.appendChild(tok);
  }
}

function activeTurnId(payload) {
  const s = payload.state || {};
  if (s.order && typeof s.turnIndex === 'number') return s.order[s.turnIndex % s.order.length];
  if (s.drawerId) return s.drawerId;
  return null;
}

// ---------- Snakes & Ladders ----------
function renderSnakes(payload) {
  const s = payload.state;
  const players = payload.players || [];
  const byPos = {};
  for (const p of players) {
    const pos = s.positions[p.id] || 0;
    (byPos[pos] = byPos[pos] || []).push(p.avatar);
  }

  let cells = '';
  for (let n = 100; n >= 1; n--) {
    const rowFromBottom = Math.floor((n - 1) / 10);
    const idx = (n - 1) % 10;
    const col = rowFromBottom % 2 === 0 ? idx : 9 - idx;
    const gridRow = 10 - rowFromBottom;
    let cls = 'cell';
    let icon = '';
    if (s.ladders[n]) { cls += ' ladder'; icon = '🪜'; }
    if (s.snakes[n]) { cls += ' snake'; icon = '🐍'; }
    const toks = (byPos[n] || []).map((a) => `<span>${a}</span>`).join('');
    cells += `<div class="${cls}" style="grid-row:${gridRow};grid-column:${col + 1}">
      ${n}${icon ? `<span class="cell-icon">${icon}</span>` : ''}
      <div class="toks">${toks}</div></div>`;
  }

  gameStage.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 26vw;gap:2vw;align-items:center;flex:1">
      <div class="board">${cells}</div>
      <div class="dice-area">
        <div class="dice ${payload.animateRoll ? 'rolling' : ''}">${diceFace(s.lastRoll)}</div>
        <div class="game-msg">${escapeHtml(s.message || '')}</div>
      </div>
    </div>`;

  if (s.winner) confettiBurst();
}

function diceFace(n) {
  return ['🎲', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'][n || 0];
}

// ---------- Story Builder ----------
function renderStory(payload) {
  const s = payload.state;
  if (s.phase === 'reveal') {
    gameStage.innerHTML = `
      <div class="story-stage">
        <div class="story-title">📖 ${escapeHtml(s.title)}</div>
        <div class="story-text">${escapeHtml(s.finished)}</div>
        <div class="story-turn">Tap “New Story” on a phone to write another!</div>
      </div>`;
    confettiBurst();
    return;
  }

  // Walk parts, weaving in filled / pending blanks.
  let html = '';
  let bi = 0;
  const nextBlank = s.blanks.findIndex((b) => b.value == null);
  for (let i = 0; i < s.parts.length; i++) {
    if (s.parts[i] === null) {
      const b = s.blanks[bi];
      if (b.value != null) {
        html += `<span class="blank-filled">${escapeHtml(b.value)}</span>`;
      } else if (bi === nextBlank) {
        html += `<span class="blank-current">${escapeHtml(b.prompt)}?</span>`;
      } else {
        html += `<span class="blank-pending">____</span>`;
      }
      bi++;
    } else {
      html += escapeHtml(s.parts[i]);
    }
  }

  const turnId = s.order[s.turnIndex % s.order.length];
  const turnP = (payload.players || []).find((p) => p.id === turnId);
  gameStage.innerHTML = `
    <div class="story-stage">
      <div class="story-title">📖 ${escapeHtml(s.title)}</div>
      <div class="story-text">${html}</div>
      <div class="story-turn">${turnP ? `${turnP.avatar} ${escapeHtml(turnP.name)}, check your phone!` : ''}</div>
    </div>`;
}

// ---------- Draw & Guess ----------
let tvDrawCtx = null;
function renderDraw(payload) {
  const s = payload.state;
  const players = payload.players || [];
  const drawer = players.find((p) => p.id === s.drawerId);

  if (s.phase === 'roundEnd') {
    gameStage.innerHTML = `
      <div class="draw-stage">
        <div class="draw-result">${s.result.correct ? `🎉 ${escapeHtml(s.result.by)} got it!` : '⏭️ Round over'}<br>It was “${escapeHtml(s.word)}”</div>
        <div class="draw-info">Tap “Next Round” on a phone to keep playing!</div>
      </div>`;
    tvDrawCtx = null;
    if (s.result.correct) confettiBurst();
    return;
  }

  gameStage.innerHTML = `
    <div class="draw-stage">
      <div class="draw-info">✏️ ${drawer ? `${drawer.avatar} ${escapeHtml(drawer.name)}` : 'Someone'} is drawing… &nbsp;Round ${s.round}</div>
      <div class="draw-canvas-wrap"><canvas id="tvDraw" width="800" height="560"></canvas></div>
    </div>`;
  const canvas = $('tvDraw');
  tvDrawCtx = canvas.getContext('2d');
  tvDrawCtx.lineWidth = 8;
  tvDrawCtx.lineCap = 'round';
  tvDrawCtx.lineJoin = 'round';
  tvDrawCtx.strokeStyle = '#222';
  tvDrawCtx._w = canvas.width;
  tvDrawCtx._h = canvas.height;
}

socket.on('draw:stroke', ({ from, to }) => {
  if (!tvDrawCtx) return;
  tvDrawCtx.beginPath();
  tvDrawCtx.moveTo(from.x * tvDrawCtx._w, from.y * tvDrawCtx._h);
  tvDrawCtx.lineTo(to.x * tvDrawCtx._w, to.y * tvDrawCtx._h);
  tvDrawCtx.stroke();
});
socket.on('draw:clear', () => {
  if (tvDrawCtx) tvDrawCtx.clearRect(0, 0, tvDrawCtx._w, tvDrawCtx._h);
});

// ---------- Narration ----------
function primeSpeech() {
  if (!window.speechSynthesis) return;
  // Speaking an empty utterance on a gesture unlocks audio on some browsers.
  try { window.speechSynthesis.resume(); } catch (e) { /* ignore */ }
}
socket.on('tv:narrate', ({ text }) => {
  if (!window.speechSynthesis || !text) return;
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 0.98;
  u.pitch = 1.1;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
});

// ---------- Toast + confetti ----------
let toastTimer;
socket.on('tv:toast', ({ text }) => {
  const t = $('toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
});

function confettiBurst() {
  const emojis = ['🎉', '⭐', '🎊', '🌈', '✨'];
  for (let i = 0; i < 30; i++) {
    const c = document.createElement('div');
    c.className = 'confetti';
    c.textContent = emojis[i % emojis.length];
    c.style.left = Math.floor((i / 30) * 100) + 'vw';
    c.style.animationDelay = (i % 10) * 0.12 + 's';
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 3200);
  }
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
