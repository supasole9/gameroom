// Draw & Guess — one player draws a secret word on their phone, the strokes
// appear live on the TV, and everyone else taps to guess. Picture-button
// guessing keeps it playable for the youngest kids.

const WORDS = [
  'cat', 'dog', 'sun', 'house', 'tree', 'fish', 'star', 'car', 'flower', 'boat',
  'apple', 'snowman', 'butterfly', 'rainbow', 'rocket', 'ice cream', 'balloon',
  'robot', 'frog', 'hat', 'banana', 'moon', 'duck', 'cookie', 'crown',
];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function startRound(ctx) {
  const order = ctx.state ? ctx.state.order : ctx.players.map((p) => p.id);
  const roundNum = ctx.state ? ctx.state.round + 1 : 1;
  const drawerId = order[(roundNum - 1) % order.length];
  const picks = shuffle(WORDS).slice(0, 4);
  const word = picks[Math.floor(Math.random() * picks.length)];

  ctx.state = {
    round: roundNum,
    order,
    drawerId,
    word,
    choices: shuffle(picks),
    phase: 'drawing',
    result: null,
  };
  ctx.tvEvent('draw:clear', {});
  ctx.renderTV();
  renderControllers(ctx);
  const drawer = ctx.players.find((p) => p.id === drawerId);
  if (drawer) ctx.narrate(`${drawer.name}, it's your turn to draw. Everyone else, get ready to guess!`);
}

function renderControllers(ctx) {
  const s = ctx.state;
  if (s.phase === 'roundEnd') {
    return ctx.renderControllers(() => ({
      title: s.result.correct ? '🎉 Correct!' : '⏭️ Round over',
      subtitle: `It was "${s.word}"`,
      controls: [{ type: 'button', id: 'next', label: '▶️ Next Round', big: true, color: '#22c55e' }],
    }));
  }
  ctx.renderControllers((p) => {
    if (p.id === s.drawerId) {
      return {
        title: '✏️ You are the artist!',
        subtitle: `Draw: ${s.word}`,
        controls: [
          { type: 'draw', id: 'pad' },
          { type: 'button', id: 'clear', label: '🧽 Clear', color: '#94a3b8' },
        ],
      };
    }
    return {
      title: '🔍 What is it?',
      subtitle: 'Watch the TV and tap your guess!',
      controls: [{ type: 'choices', id: 'guess', options: s.choices.map((w) => ({ id: w, label: w })) }],
    };
  });
}

export default {
  id: 'draw',
  name: 'Draw & Guess',
  emoji: '🎨',
  minPlayers: 2,
  maxPlayers: 6,
  blurb: 'One artist draws, everyone else guesses. Live on the TV!',

  init(ctx) {
    ctx.state = null;
    startRound(ctx);
  },

  onAction(ctx, player, action) {
    const s = ctx.state;

    // Live drawing: forward strokes straight to the TV (don't bloat state).
    if (action.control === 'stroke' && player.id === s.drawerId) {
      ctx.tvEvent('draw:stroke', action.value);
      return;
    }
    if (action.control === 'clear' && player.id === s.drawerId) {
      ctx.tvEvent('draw:clear', {});
      return;
    }

    if (action.control === 'next' && s.phase === 'roundEnd') {
      startRound(ctx);
      return;
    }

    if (action.control === 'guess' && s.phase === 'drawing') {
      if (player.id === s.drawerId) return; // the artist can't guess
      const correct = action.value === s.word;
      if (correct) {
        ctx.addScore(player.id, 2);
        ctx.addScore(s.drawerId, 1);
        s.phase = 'roundEnd';
        s.result = { correct: true, by: player.name };
        ctx.renderTV();
        ctx.narrate(`${player.name} guessed it! It was a ${s.word}. Two points!`);
        renderControllers(ctx);
      } else {
        // Gentle nudge, round continues.
        ctx.view(player.id, {
          title: '🔍 Not quite!',
          subtitle: 'Keep watching and try again!',
          controls: [{ type: 'choices', id: 'guess', options: s.choices.map((w) => ({ id: w, label: w })) }],
          flash: 'wrong',
        });
      }
    }
  },
};
