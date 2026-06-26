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
  {
    title: 'The Magic Pet',
    parts: [
      'For their birthday, ',
      { prompt: "someone's name", hint: 'a name', suggestions: ['Mia', 'Leo', 'Grandma', 'the baby'] },
      ' got a pet ',
      { prompt: 'a silly animal', hint: 'e.g. llama', suggestions: ['llama', 'platypus', 'tiny dragon', 'fluffy spider'] },
      ' named ',
      { prompt: 'a funny pet name', hint: 'e.g. Sir Wiggles', suggestions: ['Sir Wiggles', 'Tofu', 'Captain Fuzz', 'Mr. Pickle'] },
      '. It could ',
      { prompt: 'a magic power', hint: 'e.g. burp bubbles', suggestions: ['burp bubbles', 'turn invisible', 'fly backwards', 'sneeze glitter'] },
      ' whenever it ate ',
      { prompt: 'a food', hint: 'e.g. broccoli', suggestions: ['broccoli', 'tacos', 'crayons', 'birthday cake'] },
      '. The whole town said it was the most ',
      { prompt: 'a describing word', hint: 'e.g. amazing', suggestions: ['amazing', 'ridiculous', 'sparkly', 'stinky'] },
      ' pet ever!',
    ],
  },
  {
    title: 'Under the Sea',
    parts: [
      'Deep under the ocean lived a ',
      { prompt: 'a color', hint: 'e.g. turquoise', suggestions: ['turquoise', 'hot pink', 'glow-in-the-dark', 'golden'] },
      ' ',
      { prompt: 'a sea creature', hint: 'e.g. octopus', suggestions: ['octopus', 'jellyfish', 'shark', 'seahorse'] },
      ' who loved to ',
      { prompt: 'an activity', hint: 'e.g. dance', suggestions: ['dance', 'tell jokes', 'race crabs', 'collect shells'] },
      '. One day it found a treasure chest full of ',
      { prompt: 'a silly treasure', hint: 'e.g. rubber ducks', suggestions: ['rubber ducks', 'old socks', 'shiny gum', 'tiny hats'] },
      '. "',
      { prompt: 'a happy word', hint: 'e.g. Wahoo', suggestions: ['Wahoo', 'Bubbles', 'Yesss', 'Glub glub'] },
      '!" it cried, and shared every bit with its best friend, a ',
      { prompt: 'another sea creature', hint: 'e.g. clownfish', suggestions: ['clownfish', 'giant whale', 'grumpy crab', 'starfish'] },
      '.',
    ],
  },
  {
    title: 'The Mixed-Up Zoo',
    parts: [
      'At the silliest zoo in the world, the ',
      { prompt: 'an animal', hint: 'e.g. monkey', suggestions: ['monkey', 'flamingo', 'hippo', 'sloth'] },
      ' escaped and started ',
      { prompt: 'a silly action', hint: 'e.g. juggling', suggestions: ['juggling', 'breakdancing', 'baking pies', 'singing opera'] },
      ' on top of the ',
      { prompt: 'a place', hint: 'e.g. ice cream stand', suggestions: ['ice cream stand', 'merry-go-round', 'gift shop', 'snack bar'] },
      '. The zookeeper grabbed a ',
      { prompt: 'a random object', hint: 'e.g. trampoline', suggestions: ['trampoline', 'banana', 'fishing net', 'kazoo'] },
      ' and yelled "',
      { prompt: 'something to shout', hint: 'e.g. Come back!', suggestions: ['Come back!', 'Oopsie!', 'Not again!', 'Tickle attack!'] },
      '" Everyone laughed so hard they turned ',
      { prompt: 'a color', hint: 'e.g. bright red', suggestions: ['bright red', 'purple', 'rainbow', 'green'] },
      '!',
    ],
  },
  {
    title: 'The Pancake Disaster',
    parts: [
      'On Saturday morning, ',
      { prompt: "someone's name", hint: 'a name', suggestions: ['Dad', 'Auntie', 'Max', 'the robot'] },
      ' tried to make pancakes, but used ',
      { prompt: 'a silly ingredient', hint: 'e.g. toothpaste', suggestions: ['toothpaste', 'glitter', 'pickle juice', 'confetti'] },
      ' instead of milk. The batter started to ',
      { prompt: 'an action', hint: 'e.g. bubble', suggestions: ['bubble', 'giggle', 'bounce', 'glow'] },
      ' and grew as big as a ',
      { prompt: 'something big', hint: 'e.g. school bus', suggestions: ['school bus', 'whale', 'mountain', 'couch'] },
      '! It chased everyone around the ',
      { prompt: 'a room', hint: 'e.g. kitchen', suggestions: ['kitchen', 'backyard', 'living room', 'garage'] },
      ' until they covered it in ',
      { prompt: 'a topping', hint: 'e.g. syrup', suggestions: ['syrup', 'whipped cream', 'sprinkles', 'cheese'] },
      ' and ate it for breakfast. Yum?',
    ],
  },
  {
    title: 'Superhero Nap Time',
    parts: [
      'The mighty hero Captain ',
      { prompt: 'a power word', hint: 'e.g. Thunder', suggestions: ['Thunder', 'Sparkle', 'Noodle', 'Bubblegum'] },
      ' could ',
      { prompt: 'a superpower', hint: 'e.g. run super fast', suggestions: ['run super fast', 'talk to cats', 'stretch like rubber', 'freeze ice cream'] },
      ', but only after a good nap. One day a villain named ',
      { prompt: 'a silly villain name', hint: 'e.g. Dr. Stinky', suggestions: ['Dr. Stinky', 'The Tickler', 'Lord Broccoli', 'Madame Mud'] },
      ' stole all the ',
      { prompt: 'a plural thing', hint: 'e.g. pillows', suggestions: ['pillows', 'cookies', 'puppies', 'socks'] },
      ' in town! Our hero zoomed over and ',
      { prompt: 'a way to win', hint: 'e.g. tickled them', suggestions: ['tickled them', 'told a joke', 'shared a snack', 'did a silly dance'] },
      ' to save the day. Then took another nap. The end.',
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
