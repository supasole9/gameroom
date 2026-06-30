/* global io */
const socket = io();
const $ = (id) => document.getElementById(id);

const lobbyEl = $('lobby');
const gameViewEl = $('gameView');
const gameStage = $('gameStage');

let games = [];

// ---------- Collapsible top header (title + room code/QR) ----------
const HIDE_KEY = 'arcadeHideHeader';
function applyHeader(hidden) {
  $('topHeader').classList.toggle('collapsed', hidden);
  $('hdrShow').classList.toggle('hide', !hidden);
}
applyHeader(localStorage.getItem(HIDE_KEY) === '1');
$('hdrHide').addEventListener('click', () => { localStorage.setItem(HIDE_KEY, '1'); applyHeader(true); });
$('hdrShow').addEventListener('click', () => { localStorage.setItem(HIDE_KEY, '0'); applyHeader(false); });

// On load, this screen becomes the host/TV. We pass our own origin so the
// server can build a QR code that points exactly where we're served from.
socket.on('connect', () => socket.emit('host:create', { origin: location.origin }));

socket.on('host:created', ({ code, games: catalogue, joinUrl, qr }) => {
  games = catalogue;
  $('roomCode').textContent = code;
  $('joinUrl').textContent = (joinUrl || location.origin + '/').replace(/^https?:\/\//, '');
  if (qr) {
    const img = $('qrImg');
    img.src = qr;
    img.classList.remove('hide');
  }
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
    tok.className = 'player-tok' + (p.connected ? '' : ' offline');
    tok.dataset.id = p.id;
    const status = p.connected ? '' : '<span class="off-tag">offline</span>';
    tok.innerHTML = `<button class="rm" title="Remove player">✕</button>
      <span class="av">${avatarHTML(p.avatar)}</span><span class="nm">${escapeHtml(p.name)}</span>${status}`;
    tok.querySelector('.rm').addEventListener('click', () => {
      socket.emit('host:removePlayer', { clientId: p.id });
    });
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
let currentGameId = null;
socket.on('tv:game', (payload) => {
  lobbyEl.classList.add('hide');
  gameViewEl.classList.remove('hide');
  currentGameId = payload.gameId;
  renderScorebar(payload.players, payload);
  switch (payload.gameId) {
    case 'snakes': renderSnakes(payload); break;
    case 'story': renderStory(payload); break;
    case 'draw': renderDraw(payload); break;
    case 'mathtug': renderMathTug(payload); break;
    case 'laie': renderLaie(payload); break;
    case 'brawl': renderBrawl(payload); break;
    case 'jeopardy': renderJeopardy(payload); break;
  }
});

function renderScorebar(players, payload) {
  const bar = $('scorebar');
  bar.innerHTML = '';
  const activeId = activeTurnId(payload);
  for (const p of players || []) {
    const tok = document.createElement('div');
    tok.className = 'player-tok' + (p.id === activeId ? ' active-turn' : '');
    tok.innerHTML = `<span class="av">${avatarHTML(p.avatar)}</span><span class="nm">${escapeHtml(p.name)}</span><span class="sc">${p.score}⭐</span>`;
    bar.appendChild(tok);
  }
}

function activeTurnId(payload) {
  const s = payload.state || {};
  if (s.pickerId) return s.pickerId;
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
    const toks = (byPos[n] || []).map((a) => `<span>${avatarHTML(a)}</span>`).join('');
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

  // The story stays a SECRET during play — show only what we're asking for now,
  // so the finished mad-lib is a big reveal at the end.
  const filled = s.blanks.filter((b) => b.value != null).length;
  const total = s.blanks.length;
  const nextBlank = s.blanks.findIndex((b) => b.value == null);
  const prompt = nextBlank >= 0 ? s.blanks[nextBlank].prompt : '';

  const turnId = s.order[s.turnIndex % s.order.length];
  const turnP = (payload.players || []).find((p) => p.id === turnId);
  gameStage.innerHTML = `
    <div class="story-stage">
      <div class="story-title">📖 ${escapeHtml(s.title)}</div>
      <div class="story-ask-label">Give me…</div>
      <div class="story-ask">${escapeHtml(prompt)}</div>
      <div class="story-progress">Word ${Math.min(filled + 1, total)} of ${total} · 🙈 the story is a secret until the end!</div>
      <div class="story-turn">${turnP ? `${avatarHTML(turnP.avatar)} ${escapeHtml(turnP.name)}, check your phone!` : ''}</div>
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
      <div class="draw-info">✏️ ${drawer ? `${avatarHTML(drawer.avatar)} ${escapeHtml(drawer.name)}` : 'Someone'} is drawing… &nbsp;Round ${s.round}</div>
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

// ---------- Math Tug of War ----------
const DIFF_LABEL = { easy: '😊 Easy', medium: '🙂 Medium', hard: '😎 Hard' };
function renderMathTug(payload) {
  const s = payload.state;
  const players = payload.players || [];
  const find = (cid) => players.find((p) => p.id === cid) || { avatar: '🎮', name: '—' };
  const A = find(s.competitors[0]);
  const B = find(s.competitors[1]);

  if (s.phase === 'setup') {
    const card = (cid, p) => {
      const d = s.difficulty[cid];
      return `<div class="tug-pick">
        <div class="av" style="font-size:5vw">${avatarHTML(p.avatar)}</div>
        <div style="font-size:2vw;font-weight:800">${escapeHtml(p.name)}</div>
        <div style="font-size:1.6vw;color:${d ? 'var(--green)' : 'var(--muted)'}">${d ? DIFF_LABEL[d] + ' ✓' : 'choosing…'}</div>
      </div>`;
    };
    gameStage.innerHTML = `
      <div class="tug-stage">
        <h2 style="font-size:3vw">🪢 Math Tug of War</h2>
        <p style="font-size:1.8vw;color:var(--muted)">Each player, pick your level on your phone!</p>
        <div style="display:flex;gap:6vw;margin-top:3vh">${card(s.competitors[0], A)}${card(s.competitors[1], B)}</div>
      </div>`;
    return;
  }

  const pct = ((s.position + s.win) / (2 * s.win)) * 100;
  const isOver = s.phase === 'over';
  gameStage.innerHTML = `
    <div class="tug-stage">
      <div class="tug-header">
        <div class="tug-side left">
          <span class="av">${avatarHTML(A.avatar)}</span>
          <span class="nm">${escapeHtml(A.name)}</span>
          <span class="meta">${DIFF_LABEL[s.difficulty[s.competitors[0]]] || ''} · ${s.pulls[s.competitors[0]] || 0} pulls</span>
        </div>
        <div class="tug-vs">⬅️ TUG ➡️</div>
        <div class="tug-side right">
          <span class="av">${avatarHTML(B.avatar)}</span>
          <span class="nm">${escapeHtml(B.name)}</span>
          <span class="meta">${DIFF_LABEL[s.difficulty[s.competitors[1]]] || ''} · ${s.pulls[s.competitors[1]] || 0} pulls</span>
        </div>
      </div>
      <div class="tug-track">
        <div class="tug-zone zleft"></div>
        <div class="tug-zone zright"></div>
        <div class="tug-rope"></div>
        <div class="tug-knot" style="left:${pct}%">🎌</div>
      </div>
      ${isOver ? `<div class="tug-result">🎉 ${escapeHtml(find(s.winner).name)} wins!</div>`
        : `<div class="tug-hint">Answer fast on your phone to pull the flag your way!</div>`}
    </div>`;

  if (isOver) confettiBurst();
}

// ---------- Lāʻie & Kahuku (Monopoly-lite) ----------
// Map a board index (0..23) to a cell on the 7x7 perimeter ring.
function ringCell(i) {
  if (i <= 6) return { r: 1, c: i + 1 };          // top row, left→right
  if (i <= 12) return { r: i - 5, c: 7 };         // right col, top→bottom
  if (i <= 18) return { r: 7, c: 7 - (i - 12) };  // bottom row, right→left
  return { r: 7 - (i - 18), c: 1 };               // left col, bottom→top
}

function renderLaie(payload) {
  const s = payload.state;
  const players = payload.players || [];
  const find = (cid) => players.find((p) => p.id === cid) || { avatar: '🎮', name: '—' };
  const curId = s.order[s.turnIndex];

  // tokens on each space
  const tokensOn = {};
  for (const cid of s.order) {
    const pos = s.positions[cid];
    (tokensOn[pos] = tokensOn[pos] || []).push(find(cid).avatar);
  }

  let cells = '';
  for (let i = 0; i < s.board.length; i++) {
    const sp = s.board[i];
    const { r, c } = ringCell(i);
    const owner = s.owners[i];
    const ownerAv = owner ? find(owner).avatar : '';
    const band = sp.color ? `<div class="lc-band" style="background:${sp.color}"></div>` : '';
    const foot = sp.type === 'prop'
      ? `<div class="lc-foot">${ownerAv ? avatarHTML(ownerAv) : '$' + sp.price}</div>`
      : (sp.note ? `<div class="lc-foot lc-note">${escapeHtml(sp.note)}</div>` : '');
    const toks = (tokensOn[i] || []).map((a) => `<span>${avatarHTML(a)}</span>`).join('');
    // Property cells show no icon (it was confusing next to player tokens);
    // special spaces (corners, chance) keep their icon to stand out.
    const emojiHtml = sp.type === 'prop' ? '' : `<div class="lc-emoji">${sp.emoji}</div>`;
    cells += `<div class="lc ${sp.type} ${sp.deck || ''}" style="grid-row:${r};grid-column:${c}">
      ${band}
      ${emojiHtml}
      <div class="lc-name${sp.type === 'prop' ? ' prop-name' : ''}">${escapeHtml(sp.name)}</div>
      ${foot}
      <div class="lc-toks">${toks}</div>
    </div>`;
  }

  // center: dice + message + leaderboard
  const ranked = s.order.map((cid) => ({ cid, cash: s.cash[cid], worth: s.board.reduce((a, sp, idx) => a + (s.owners[idx] === cid ? sp.price : 0), s.cash[cid]) }));
  const board = ranked.map((e) => {
    const p = find(e.cid);
    const isCur = e.cid === curId && s.phase !== 'over';
    const isWin = s.winner === e.cid;
    return `<div class="lb-row ${isCur ? 'lb-cur' : ''} ${isWin ? 'lb-win' : ''}">
      <span class="lb-av">${avatarHTML(p.avatar)}</span>
      <span class="lb-nm">${escapeHtml(p.name)}</span>
      <span class="lb-cash">$${e.cash}</span>
    </div>`;
  }).join('');

  const center = `<div class="lc-center" style="grid-row:2/7;grid-column:2/7">
    <div class="lc-title">🏝️ Lāʻie &amp; Kahuku</div>
    <div class="lc-dice ${payload.animateRoll ? 'rolling' : ''}">${diceFace(s.dice)}</div>
    ${s.card ? `<div class="lc-card ${s.card.deck}"><div class="lc-card-title">${s.card.deck === 'talkstory' ? '🎁' : '🃏'} ${escapeHtml(s.card.title)}</div><div class="lc-card-text">${escapeHtml(s.card.text)}</div></div>` : ''}
    <div class="lc-msg">${escapeHtml(s.message || '')}</div>
    <div class="lc-board">${board}</div>
  </div>`;

  gameStage.innerHTML = `<div class="laie-board">${cells}${center}</div>`;
  if (s.winner) confettiBurst();
}

// An avatar is an emoji, or an uploaded character image token "img:<url>".
// Renders at 1em so it matches the surrounding font-size wherever it's used.
function avatarHTML(av) {
  if (typeof av === 'string' && av.startsWith('img:')) return `<img class="avatar-img" src="${av.slice(4)}" alt="">`;
  return av || '🎮';
}

// ---------- Reusable half-heart life bar ----------
function renderHearts(val, max) {
  let html = '';
  for (let i = 0; i < max; i++) {
    const fill = Math.max(0, Math.min(1, val - i)); // 1, .5 or 0 for this slot
    const pct = fill >= 1 ? 100 : fill >= 0.5 ? 50 : 0;
    html += `<span class="heart"><span class="heart-bg">🤍</span><span class="heart-fill" style="width:${pct}%">❤️</span></span>`;
  }
  return html;
}

// ---------- Roll the Brawl ----------
const BRAWL_BANNER = {
  weapon: (w) => `${w} ready!`,
  miss: () => 'MISS! 😅',
  hit: () => 'HIT! 💥',
  dodge: () => 'DODGED! 🦘',
  kickback: () => 'KICKED BACK! 🧨',
  heal: () => '+1 ❤️ RECHARGED!',
  incoming: () => 'INCOMING! ⚡',
};
function renderBrawl(payload) {
  const s = payload.state;
  const players = payload.players || [];
  const find = (cid) => players.find((p) => p.id === cid) || { avatar: '🎮', name: '—' };
  const charOf = (cid) => renderFighterToken((s.chars && s.chars[cid]) || find(cid).avatar);
  const att = s.order[s.turnIndex];

  if (s.phase === 'setup') {
    const sf = (cid) => {
      const p = find(cid); const ch = s.chars[cid]; const rdy = s.ready[cid];
      return `<div class="fighter">
        <div class="big-fighter">${ch ? renderFighterToken(ch) : '❓'}</div>
        <div class="bf-name">${escapeHtml(p.name)} ${rdy ? '✅' : ''}</div>
        <div class="bf-sub">${rdy ? 'ready!' : ch ? 'picking…' : 'choosing…'}</div>
      </div>`;
    };
    gameStage.innerHTML = `
      <div class="brawl-stage world-${s.world.id}">
        <div class="brawl-world">${s.world.emoji || ''} ${escapeHtml(s.world.name)}</div>
        <div class="brawl-banner">Choose your fighters!</div>
        <div class="brawl-arena">
          ${sf(s.order[0])}
          <div class="brawl-center"><div class="brawl-vs">VS</div></div>
          ${sf(s.order[1])}
        </div>
        <div class="brawl-msg">Pick your character &amp; level on your phones, then tap Ready!</div>
      </div>`;
    return;
  }

  if (s.phase === 'over') {
    gameStage.innerHTML = `
      <div class="brawl-stage world-${s.world.id}">
        <div class="brawl-over">
          <div class="brawl-champ">🏆<div class="big-fighter cheer">${charOf(s.winner)}</div><div class="bf-name">${escapeHtml(find(s.winner).name)} WINS!</div></div>
          <div class="brawl-trash">🗑️<div class="big-fighter">${charOf(s.loser)}</div><div class="bf-name">${escapeHtml(find(s.loser).name)}</div></div>
        </div>
      </div>`;
    confettiBurst();
    return;
  }

  let banner = '';
  if (s.lastEvent && BRAWL_BANNER[s.lastEvent]) {
    banner = BRAWL_BANNER[s.lastEvent](`${WEAPON_EMOJI[s.weapon] || ''} ${capitalize(s.weapon)}`);
  }

  const fighter = (cid, side) => {
    const p = find(cid);
    const active = cid === att && s.phase !== 'over';
    return `<div class="fighter ${side} ${active ? 'active' : ''}">
      <div class="hp">${renderHearts(s.hearts[cid], s.maxHearts)}</div>
      <div class="big-fighter">${charOf(cid)}</div>
      <div class="bf-name">${escapeHtml(p.name)}</div>
    </div>`;
  };

  let center = '';
  if (s.phase === 'roll') center = `<div class="brawl-dice ${payload.animateRoll ? 'rolling' : ''}">${diceFace(s.dice)}</div>`;
  else if (s.phase === 'aim') center = `<div class="brawl-weapon">${WEAPON_EMOJI[s.weapon] || '🎯'}<div class="bw-name">${capitalize(s.weapon)}</div><div class="bw-sub">aiming…</div></div>`;
  else if (s.phase === 'defense') {
    const kindLbl = { timing: 'Time it!', mash: 'Mash!', aim: 'Jump the right way!', catch: 'Catch it!' };
    const lbl = s.dodge ? (s.dodge.mode === 'easy' ? 'Tap in time!' : (kindLbl[s.dodge.kind] || '')) : '';
    center = `<div class="brawl-incoming">⚡<div>INCOMING!</div><div class="brawl-dodgekind">${lbl}</div></div>`;
  }

  gameStage.innerHTML = `
    <div class="brawl-stage world-${s.world.id}">
      <div class="brawl-world">${escapeHtml(s.world.name)}</div>
      ${banner ? `<div class="brawl-banner ev-${s.lastEvent}">${banner}</div>` : ''}
      <div class="brawl-arena">
        ${fighter(s.order[0], 'left')}
        <div class="brawl-center">${center}</div>
        ${fighter(s.order[1], 'right')}
      </div>
      <div class="brawl-msg">${escapeHtml(s.message || '')}</div>
    </div>`;
}
const WEAPON_EMOJI = { sword: '⚔️', axe: '🪓', bow: '🏹', dynamite: '🧨' };
function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }
// A fighter token is an emoji, or an uploaded image referenced as "img:<url>".
function renderFighterToken(ch) {
  if (typeof ch === 'string' && ch.startsWith('img:')) return `<img class="fighter-img" src="${ch.slice(4)}" alt="fighter">`;
  return ch || '❓';
}

// ---------- Narration ----------
function primeSpeech() {
  if (!window.speechSynthesis) return;
  // Speaking an empty utterance on a gesture unlocks audio on some browsers.
  try { window.speechSynthesis.resume(); } catch (e) { /* ignore */ }
}
socket.on('tv:narrate', ({ text }) => {
  if (!window.speechSynthesis || !text) return;
  if (jeoMuted && currentGameId === 'jeopardy') return; // Buzz Room narrator muted — a human reads instead
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

// ---------- Jeopardy "Buzz Room" ----------
let jeoSetupSel = [];           // TV-local category selection during setup
let jeoLastPayload = null;      // last jeopardy payload, for re-rendering on mute toggle
let jeoMuted = localStorage.getItem('jeoMuted') === '1'; // narrator off -> show text, read it yourself

function jeoToggleMute() {
  jeoMuted = !jeoMuted;
  localStorage.setItem('jeoMuted', jeoMuted ? '1' : '0');
  if (jeoMuted && window.speechSynthesis) window.speechSynthesis.cancel();
  if (jeoLastPayload) renderJeopardy(jeoLastPayload); // reflect the new mode now
}

function playBuzz() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ac = new Ctx();
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'square';
    osc.frequency.value = 440;
    gain.gain.value = 0.08;
    osc.connect(gain).connect(ac.destination);
    osc.start();
    osc.frequency.setValueAtTime(660, ac.currentTime + 0.08);
    osc.stop(ac.currentTime + 0.18);
    osc.onended = () => ac.close();
  } catch { /* audio not available */ }
}

function escapeHtmlSafe(s) { return escapeHtml(String(s == null ? '' : s)); }

function renderJeopardy(payload) {
  jeoLastPayload = payload;
  const s = payload.state || {};

  if (s.phase === 'setup') return renderJeoSetup(s);
  if (s.phase === 'over') return renderJeoOver(payload, s);

  // Board phase: show the category grid. Question phases take over the screen.
  if (s.phase === 'board') {
    const cols = (s.board && s.board.columns) || [];
    const grid = cols.map((col) => {
      const tiles = col.tiles.map((t) => {
        const cls = 'jeo-tile' + (t.done ? ' done' : '');
        return `<div class="${cls}">${t.done ? '' : t.value}</div>`;
      }).join('');
      return `<div class="jeo-col"><div class="jeo-head">${col.emoji}<br>${escapeHtmlSafe(col.name)}</div>${tiles}</div>`;
    }).join('');
    const picker = (payload.players || []).find((p) => p.id === s.pickerId);
    gameStage.innerHTML = `<div class="jeo-wrap">
      <div class="jeo-board">${grid}</div>
      <div class="jeo-pickbar">${picker ? escapeHtmlSafe(picker.name) : 'Someone'}, pick a tile on your phone!</div>
    </div>`;
    return;
  }

  if (!s.current) return; // nothing to show

  // A question takes over the whole screen (reveal / answer / resolved).
  // Narrator on  -> hide the text, the TV voice reads it aloud.
  // Muted        -> show the text so a human narrator reads it.
  // Resolved     -> always show the text + correct answer so everyone sees it.
  const cat = (s.board && s.board.columns.find((c) => c.id === s.current.colId)) || {};
  const showText = jeoMuted || s.phase === 'resolved';

  let banner = '🔔 Listen — the narrator is reading the question!';
  if (jeoMuted && (s.phase === 'reveal' || s.phase === 'answer')) {
    banner = 'Question read aloud — BUZZ on your phone when you know it!';
  }
  if (s.phase === 'answer') {
    const who = (payload.players || []).find((p) => p.id === s.buzzedBy);
    banner = `🔔 ${who ? escapeHtmlSafe(who.name) : 'Someone'} buzzed — answering…`;
  } else if (s.phase === 'resolved') {
    const r = s.lastResult || {};
    const who = (payload.players || []).find((p) => p.id === r.pid);
    banner = r.correct ? `✅ ${escapeHtmlSafe(who && who.name || '')} got it! +${r.value}`
      : `❌ The answer was ${'ABCD'[r.answer]}.`;
  }

  let body;
  if (showText) {
    const choices = s.current.choices.map((c, i) => {
      const right = s.phase === 'resolved' && i === s.current.answer ? ' right' : '';
      return `<div class="jeo-choice${right}">${'ABCD'[i]}. ${escapeHtmlSafe(c)}</div>`;
    }).join('');
    body = `<div class="jeo-q">${escapeHtmlSafe(s.current.q)}</div><div class="jeo-choices">${choices}</div>`;
  } else {
    body = '<div class="jeo-listen">🔊</div><div class="jeo-q">Listen!</div>';
  }

  const muteLabel = jeoMuted ? '🔇 Muted — tap for narrator' : '🔊 Narrator on — tap to mute';
  gameStage.innerHTML = `<div class="jeo-wrap question">
    <button id="jeoMute" class="jeo-mute">${muteLabel}</button>
    <div class="jeo-qcat">${cat.emoji || ''} ${escapeHtmlSafe(cat.name || '')} — ${s.current.value}</div>
    ${body}
    <div class="jeo-banner">${banner}</div>
  </div>`;
  const mb = $('jeoMute');
  if (mb) mb.addEventListener('click', jeoToggleMute);

  if (payload.buzz) playBuzz();
}

function renderJeoSetup(s) {
  const cats = s.catalogue || [];
  const cards = cats.map((c) => {
    const on = jeoSetupSel.includes(c.id);
    return `<div class="jeo-cat${on ? ' sel' : ''}" data-id="${c.id}">${c.emoji}<div>${escapeHtmlSafe(c.name)}</div></div>`;
  }).join('');
  const canStart = jeoSetupSel.length >= 2 && jeoSetupSel.length <= 4;
  gameStage.innerHTML = `
    <div class="jeo-setup">
      <h2>Pick 2–4 categories</h2>
      <div class="jeo-cats">${cards}</div>
      <button id="jeoStart" class="jeo-start" ${canStart ? '' : 'disabled'}>Start (${jeoSetupSel.length})</button>
    </div>`;
  gameStage.querySelectorAll('.jeo-cat').forEach((el) => {
    el.addEventListener('click', () => {
      const id = el.dataset.id;
      const i = jeoSetupSel.indexOf(id);
      if (i >= 0) jeoSetupSel.splice(i, 1);
      else if (jeoSetupSel.length < 4) jeoSetupSel.push(id);
      renderJeoSetup(s); // re-render with new selection
    });
  });
  const startBtn = $('jeoStart');
  if (startBtn) startBtn.addEventListener('click', () => {
    if (jeoSetupSel.length >= 2 && jeoSetupSel.length <= 4) {
      socket.emit('host:gameAction', { control: 'categories', value: jeoSetupSel.slice() });
    }
  });
}

function renderJeoOver(payload, s) {
  jeoSetupSel = []; // reset for a possible next game
  const winner = (payload.players || []).find((p) => p.id === s.winner);
  const ranked = [...(payload.players || [])].sort((a, b) => b.score - a.score);
  const rows = ranked.map((p) =>
    `<div class="jeo-rank"><span class="av">${avatarHTML(p.avatar)}</span> ${escapeHtmlSafe(p.name)} — ${p.score}</div>`).join('');
  gameStage.innerHTML = `
    <div class="jeo-over">
      <h1>🏆 ${winner ? escapeHtmlSafe(winner.name) : 'Nobody'} wins!</h1>
      <div class="jeo-ranks">${rows}</div>
      <div class="jeo-banner">Tap "Play Again" on a phone for a rematch.</div>
    </div>`;
}
