// Draw & Guess — one player draws a secret word on their phone, the strokes
// appear live on the TV, and everyone else taps to guess. Picture-button
// guessing keeps it playable for the youngest kids.

const WORDS = [
  // animals
  'cat', 'dog', 'fish', 'frog', 'duck', 'bird', 'bee', 'snail', 'snake', 'owl',
  'pig', 'cow', 'horse', 'sheep', 'rabbit', 'mouse', 'lion', 'tiger', 'bear', 'monkey',
  'elephant', 'giraffe', 'zebra', 'penguin', 'turtle', 'octopus', 'crab', 'whale', 'shark', 'dolphin',
  'dinosaur', 'dragon', 'unicorn', 'spider', 'butterfly', 'ladybug', 'caterpillar', 'fox', 'koala', 'kangaroo',
  // nature & sky
  'sun', 'moon', 'star', 'cloud', 'rainbow', 'tree', 'flower', 'leaf', 'mountain', 'volcano',
  'island', 'wave', 'snowflake', 'lightning', 'campfire', 'cactus', 'mushroom', 'pumpkin',
  // food
  'apple', 'banana', 'orange', 'grapes', 'strawberry', 'watermelon', 'carrot', 'corn', 'pizza', 'burger',
  'hot dog', 'taco', 'cookie', 'cake', 'cupcake', 'donut', 'ice cream', 'lollipop', 'candy', 'egg',
  'cheese', 'bread', 'pancakes', 'popcorn',
  // things & vehicles
  'house', 'castle', 'tent', 'car', 'truck', 'bus', 'train', 'boat', 'rocket', 'airplane',
  'bicycle', 'kite', 'balloon', 'umbrella', 'clock', 'key', 'book', 'pencil', 'scissors', 'cup',
  'hat', 'crown', 'glasses', 'shoe', 'sock', 'shirt', 'bell', 'drum', 'guitar', 'ball',
  // characters & fun
  'robot', 'snowman', 'ghost', 'witch', 'pirate', 'clown', 'king', 'queen', 'mermaid', 'superhero',
  'alien', 'wizard', 'angel', 'monster',
  // body & misc
  'eye', 'hand', 'foot', 'smile', 'heart', 'present', 'treasure', 'map', 'flag', 'bridge',
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

  sync(ctx) {
    // Canvas strokes aren't replayed, but the round/role/choices are restored.
    ctx.renderTV();
    renderControllers(ctx);
  },

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
