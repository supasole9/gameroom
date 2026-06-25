// Math Tug of War — a 2-player duel. Each player answers math questions on
// their phone; every correct answer pulls the rope toward their side. First to
// pull it all the way wins. Each player picks their OWN difficulty, so mixed
// ages can play fairly (give the 6-year-old Easy and the 10-year-old Hard).

const WIN = 6; // correct-answer "pulls" needed to drag the rope to your end

const DIFFS = {
  easy: '😊 Easy',
  medium: '🙂 Medium',
  hard: '😎 Hard',
};

function rnd(n) { return Math.floor(Math.random() * n); }
function between(lo, hi) { return lo + rnd(hi - lo + 1); }
function shuffle(a) {
  a = [...a];
  for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function makeQuestion(diff) {
  let a, b, op, answer;
  if (diff === 'easy') {
    op = Math.random() < 0.5 ? '+' : '−';
    a = between(0, 10); b = between(0, 10);
    if (op === '−' && b > a) [a, b] = [b, a];
    answer = op === '+' ? a + b : a - b;
  } else if (diff === 'medium') {
    const r = Math.random();
    if (r < 0.4) { op = '+'; a = between(0, 30); b = between(0, 30); answer = a + b; }
    else if (r < 0.8) { op = '−'; a = between(0, 40); b = between(0, 40); if (b > a) [a, b] = [b, a]; answer = a - b; }
    else { op = '×'; a = between(2, 6); b = between(2, 6); answer = a * b; }
  } else { // hard
    const r = Math.random();
    if (r < 0.3) { op = '+'; a = between(10, 99); b = between(10, 99); answer = a + b; }
    else if (r < 0.55) { op = '−'; a = between(10, 99); b = between(1, 99); if (b > a) [a, b] = [b, a]; answer = a - b; }
    else if (r < 0.8) { op = '×'; a = between(2, 12); b = between(2, 12); answer = a * b; }
    else { op = '÷'; b = between(2, 12); answer = between(2, 12); a = b * answer; }
  }

  // Build 4 plausible options around the answer.
  const opts = new Set([answer]);
  let guard = 0;
  while (opts.size < 4 && guard++ < 60) {
    const spread = Math.max(3, Math.round(Math.abs(answer) * 0.25) + 2);
    let cand = answer + (Math.random() < 0.5 ? -1 : 1) * between(1, spread);
    if (cand < 0) cand = answer + between(1, spread);
    opts.add(cand);
  }
  for (let n = 0; opts.size < 4; n++) opts.add(n); // safety net
  const options = shuffle([...opts]).map((v) => ({ id: String(v), label: String(v) }));
  return { text: `${a} ${op} ${b}`, answer, options };
}

function sideOf(ctx, cid) {
  // competitors[0] pulls left (negative), competitors[1] pulls right (positive)
  return ctx.state.competitors[0] === cid ? -1 : +1;
}
function nameOf(ctx, cid) {
  return ctx.players.find((p) => p.id === cid)?.name || 'Player';
}

function renderControllers(ctx) {
  const s = ctx.state;
  ctx.renderControllers((p) => {
    const isCompetitor = s.competitors.includes(p.id);
    if (!isCompetitor) {
      return { title: '🍿 Math Tug of War', subtitle: 'Watch the battle on the TV!', controls: [] };
    }

    if (s.phase === 'setup') {
      if (s.difficulty[p.id]) {
        const other = s.competitors.find((c) => c !== p.id);
        const waiting = !s.difficulty[other];
        return {
          title: `Level set: ${DIFFS[s.difficulty[p.id]]} ✓`,
          subtitle: waiting ? 'Waiting for the other player…' : 'Get ready!',
          controls: [],
        };
      }
      return {
        title: 'Pick your level',
        subtitle: 'How tricky should YOUR questions be?',
        controls: [{
          type: 'choices', id: 'difficulty',
          options: Object.entries(DIFFS).map(([id, label]) => ({ id, label })),
        }],
      };
    }

    if (s.phase === 'over') {
      const won = s.winner === p.id;
      return {
        title: won ? '🎉 You win!' : 'So close!',
        subtitle: 'Great mathing!',
        controls: [{ type: 'button', id: 'again', label: '🔁 Play Again', big: true, color: '#22c55e' }],
      };
    }

    // play
    const q = s.questions[p.id];
    const pullDir = sideOf(ctx, p.id) < 0 ? '⬅️ Pull LEFT!' : 'Pull RIGHT! ➡️';
    return {
      title: `${q.text} = ?`,
      subtitle: `${pullDir}  Tap the answer fast!`,
      controls: [{ type: 'choices', id: 'answer', options: q.options }],
    };
  });
}

function startPlay(ctx) {
  const s = ctx.state;
  s.phase = 'play';
  s.position = 0;
  s.winner = null;
  s.pulls = { [s.competitors[0]]: 0, [s.competitors[1]]: 0 };
  s.questions = {};
  for (const cid of s.competitors) s.questions[cid] = makeQuestion(s.difficulty[cid]);
  ctx.renderTV();
  renderControllers(ctx);
  ctx.narrate(`Math tug of war! ${nameOf(ctx, s.competitors[0])} versus ${nameOf(ctx, s.competitors[1])}. Answer fast to pull the rope your way. Go!`);
}

export default {
  id: 'mathtug',
  name: 'Math Tug of War',
  emoji: '🪢',
  minPlayers: 2,
  maxPlayers: 6,
  blurb: '2-player math duel — answer fast to pull the rope! Each picks their level.',

  sync(ctx) {
    ctx.renderTV();
    renderControllers(ctx);
  },

  init(ctx) {
    // First two connected players are the competitors; the rest cheer along.
    const competitors = ctx.players.slice(0, 2).map((p) => p.id);
    ctx.state = {
      phase: 'setup',
      competitors,
      difficulty: { [competitors[0]]: null, [competitors[1]]: null },
      position: 0,
      win: WIN,
      questions: {},
      pulls: {},
      winner: null,
    };
    ctx.renderTV();
    renderControllers(ctx);
    ctx.narrate('Math Tug of War! Both players, pick your level on your phones.');
  },

  onAction(ctx, player, action) {
    const s = ctx.state;
    if (!s.competitors.includes(player.id)) return; // spectators can't act

    if (s.phase === 'setup' && action.control === 'difficulty') {
      if (!DIFFS[action.value]) return;
      s.difficulty[player.id] = action.value;
      if (s.competitors.every((c) => s.difficulty[c])) {
        startPlay(ctx);
      } else {
        ctx.renderTV();
        renderControllers(ctx);
      }
      return;
    }

    if (s.phase === 'over' && action.control === 'again') {
      startPlay(ctx);
      return;
    }

    if (s.phase !== 'play' || action.control !== 'answer') return;
    const q = s.questions[player.id];
    if (!q) return;

    if (Number(action.value) === q.answer) {
      s.pulls[player.id]++;
      const before = s.position;
      s.position += sideOf(ctx, player.id);
      s.questions[player.id] = makeQuestion(s.difficulty[player.id]); // fresh question

      if (Math.abs(s.position) >= s.win) {
        s.phase = 'over';
        s.winner = player.id;
        ctx.addScore(player.id, 1);
        ctx.renderTV();
        renderControllers(ctx);
        ctx.narrate(`${nameOf(ctx, player.id)} wins the tug of war! Amazing!`);
        return;
      }
      // Light narration when someone gets to the brink.
      if (Math.abs(s.position) === s.win - 1 && Math.abs(before) !== s.win - 1) {
        ctx.narrate(`${nameOf(ctx, player.id)} just needs one more!`);
      }
      ctx.renderTV();
      // Only the answerer needs a new question; their opponent keeps theirs.
      ctx.view(player.id, controllerViewFor(ctx, player.id));
    } else {
      // Wrong: gentle shake + a brand new question (no random-guessing payoff).
      s.questions[player.id] = makeQuestion(s.difficulty[player.id]);
      const v = controllerViewFor(ctx, player.id);
      v.flash = 'wrong';
      ctx.view(player.id, v);
    }
  },
};

// Single-competitor play view (used for incremental updates without re-rendering
// the opponent, so their in-progress question isn't disturbed).
function controllerViewFor(ctx, cid) {
  const q = ctx.state.questions[cid];
  const pullDir = sideOf(ctx, cid) < 0 ? '⬅️ Pull LEFT!' : 'Pull RIGHT! ➡️';
  return {
    title: `${q.text} = ?`,
    subtitle: `${pullDir}  Tap the answer fast!`,
    controls: [{ type: 'choices', id: 'answer', options: q.options }],
  };
}
