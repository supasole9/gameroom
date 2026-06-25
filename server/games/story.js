// Story Builder — a collaborative mad-lib. Players take turns filling in the
// blanks (typed, or tapped from kid-friendly suggestions). When the tale is
// complete the TV reads it aloud with gusto.

const TEMPLATES = [
  {
    title: 'The Birthday Surprise',
    parts: [
      'One sunny morning, a ',
      { prompt: 'a silly animal', hint: 'e.g. wombat', suggestions: ['wombat', 'penguin', 'dragon', 'noodle-cat'] },
      ' woke up and shouted "',
      { prompt: 'a funny word to yell', hint: 'e.g. BANANAS', suggestions: ['BANANAS', 'WAHOO', 'KABLAMMO', 'YIPPEE'] },
      '!" It was their birthday! For breakfast they ate ',
      { prompt: 'a yummy food', hint: 'e.g. pancakes', suggestions: ['pancakes', 'spaghetti', 'jellybeans', 'rainbow cake'] },
      ' with extra ',
      { prompt: 'a topping', hint: 'e.g. sprinkles', suggestions: ['sprinkles', 'ketchup', 'glitter', 'cheese'] },
      '. Then they put on their ',
      { prompt: 'a color', hint: 'e.g. purple', suggestions: ['purple', 'neon green', 'polka-dot', 'gold'] },
      ' party hat and danced like a ',
      { prompt: 'a way to move', hint: 'e.g. wobbly robot', suggestions: ['wobbly robot', 'tornado', 'sleepy sloth', 'kangaroo'] },
      ' all day long. The end!',
    ],
  },
  {
    title: 'The Great Space Snack Adventure',
    parts: [
      'Captain ',
      { prompt: "someone's name", hint: 'a name', suggestions: ['Zoom', 'Sparkle', 'Pickles', 'Nova'] },
      ' blasted off in a rocket made of ',
      { prompt: 'a material', hint: 'e.g. cardboard', suggestions: ['cardboard', 'marshmallows', 'LEGO', 'cheese'] },
      ' to find the planet of ',
      { prompt: 'a snack (plural)', hint: 'e.g. cookies', suggestions: ['cookies', 'tacos', 'gummy bears', 'pizzas'] },
      '. A friendly alien with ',
      { prompt: 'a number', hint: 'e.g. seven', suggestions: ['seven', 'a hundred', 'three', 'eleventy'] },
      ' eyes said "',
      { prompt: 'a greeting', hint: 'e.g. howdy', suggestions: ['howdy', 'bloop bloop', 'greetings earthling', 'hiya'] },
      '!" Together they ',
      { prompt: 'an action', hint: 'e.g. juggled', suggestions: ['juggled', 'sneezed', 'boogied', 'high-fived'] },
      ' until the stars giggled. What a trip!',
    ],
  },
];

function blankIndexes(parts) {
  return parts.map((p, i) => (typeof p === 'object' ? i : -1)).filter((i) => i >= 0);
}

function currentPlayer(ctx) {
  return ctx.state.order[ctx.state.turnIndex % ctx.state.order.length];
}

function nextUnfilled(ctx) {
  return ctx.state.blanks.findIndex((b) => b.value == null);
}

function renderControllers(ctx) {
  const s = ctx.state;
  if (s.phase === 'reveal') {
    return ctx.renderControllers(() => ({
      title: '📖 Story time!',
      subtitle: 'Listen to the TV…',
      controls: [{ type: 'button', id: 'again', label: '✨ New Story', big: true, color: '#7c5cff' }],
    }));
  }
  const curId = currentPlayer(ctx);
  const bi = nextUnfilled(ctx);
  const blank = s.blanks[bi];
  ctx.renderControllers((p) => {
    if (p.id === curId) {
      return {
        title: 'Your turn to add a word!',
        subtitle: `Give me: ${blank.prompt}`,
        controls: [
          { type: 'input', id: 'word', placeholder: blank.hint, submitLabel: 'Add to story →' },
          { type: 'choices', id: 'word', label: 'or tap one:', options: blank.suggestions.map((w) => ({ id: w, label: w })) },
        ],
      };
    }
    const curName = ctx.players.find((pl) => pl.id === curId)?.name || 'someone';
    return {
      title: 'Building the story…',
      subtitle: `${curName} is adding: ${blank.prompt}`,
      controls: [{ type: 'text', value: `${s.blanks.filter((b) => b.value != null).length} of ${s.blanks.length} words so far` }],
    };
  });
}

function startNewStory(ctx) {
  const template = TEMPLATES[Math.floor(Math.random() * TEMPLATES.length)];
  const blanks = blankIndexes(template.parts).map((partIndex) => {
    const b = template.parts[partIndex];
    return { partIndex, prompt: b.prompt, hint: b.hint, suggestions: b.suggestions, value: null, by: null };
  });
  ctx.state = {
    title: template.title,
    parts: template.parts.map((p) => (typeof p === 'string' ? p : null)), // null where a blank goes
    blanks,
    order: ctx.players.map((p) => p.id),
    turnIndex: 0,
    phase: 'filling',
  };
  ctx.renderTV();
  renderControllers(ctx);
  const first = ctx.players[0];
  if (first) ctx.narrate(`Let's write a story together, called: ${template.title}. ${first.name}, you start!`);
}

// Build the finished story text from parts + filled blanks.
function assembleStory(s) {
  let out = '';
  let bi = 0;
  for (let i = 0; i < s.parts.length; i++) {
    if (s.parts[i] === null) {
      out += s.blanks[bi].value;
      bi++;
    } else {
      out += s.parts[i];
    }
  }
  return out;
}

export default {
  id: 'story',
  name: 'Story Builder',
  emoji: '📖',
  minPlayers: 1,
  maxPlayers: 6,
  blurb: 'Build a silly story together — the TV reads it aloud!',

  sync(ctx) {
    ctx.renderTV();
    renderControllers(ctx);
  },

  init(ctx) {
    startNewStory(ctx);
  },

  onAction(ctx, player, action) {
    const s = ctx.state;
    if (action.control === 'again' && s.phase === 'reveal') {
      startNewStory(ctx);
      return;
    }
    if (s.phase !== 'filling' || action.control !== 'word') return;
    if (player.id !== currentPlayer(ctx)) return;

    const word = String(action.value || '').trim().slice(0, 40);
    if (!word) return;

    const bi = nextUnfilled(ctx);
    if (bi < 0) return;
    s.blanks[bi].value = word;
    s.blanks[bi].by = player.name;

    if (nextUnfilled(ctx) < 0) {
      // All blanks filled — reveal and narrate.
      s.phase = 'reveal';
      s.finished = assembleStory(s);
      ctx.renderTV();
      ctx.narrate(`Here is our masterpiece, ${s.title}. ${s.finished}`);
    } else {
      s.turnIndex = (s.turnIndex + 1) % s.order.length;
      ctx.renderTV();
    }
    renderControllers(ctx);
  },
};
