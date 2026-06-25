// Snakes & Ladders — the classic. Phone = a big "roll" button on your turn.
// The TV shows the board, the tokens, and narrates every roll.

// Classic Milton-Bradley layout (square -> destination).
const LADDERS = { 1: 38, 4: 14, 9: 31, 21: 42, 28: 84, 36: 44, 51: 67, 71: 91, 80: 100 };
const SNAKES = { 16: 6, 47: 26, 49: 11, 56: 53, 62: 19, 64: 60, 87: 24, 93: 73, 95: 75, 98: 78 };

function currentPlayer(ctx) {
  const order = ctx.state.order;
  return order[ctx.state.turnIndex % order.length];
}

function renderControllers(ctx) {
  const curId = currentPlayer(ctx);
  ctx.renderControllers((p) => {
    if (ctx.state.winner) {
      return { title: '🎉 Game over!', subtitle: 'Look at the TV!', controls: [] };
    }
    if (p.id === curId) {
      return {
        title: 'Your turn!',
        subtitle: `You're on square ${ctx.state.positions[p.id] || 0}`,
        controls: [{ type: 'button', id: 'roll', label: '🎲 ROLL THE DICE', big: true, color: '#ff6b6b' }],
      };
    }
    const curName = ctx.players.find((pl) => pl.id === curId)?.name || 'someone';
    return {
      title: 'Hold tight…',
      subtitle: `It's ${curName}'s turn`,
      controls: [{ type: 'text', value: `You're on square ${ctx.state.positions[p.id] || 0}` }],
    };
  });
}

export default {
  id: 'snakes',
  name: 'Snakes & Ladders',
  emoji: '🐍',
  minPlayers: 1,
  maxPlayers: 6,
  blurb: 'Roll, climb ladders, dodge snakes. First to 100 wins!',

  // Re-push current state to all screens (used when a phone reconnects).
  sync(ctx) {
    ctx.renderTV();
    renderControllers(ctx);
  },

  init(ctx) {
    const order = ctx.players.map((p) => p.id);
    const positions = {};
    for (const id of order) positions[id] = 0;
    ctx.state = {
      ladders: LADDERS,
      snakes: SNAKES,
      order,
      turnIndex: 0,
      positions,
      lastRoll: null,
      lastMover: null,
      winner: null,
      message: 'Roll to begin!',
    };
    ctx.renderTV();
    renderControllers(ctx);
    const first = ctx.players.find((p) => p.id === order[0]);
    if (first) ctx.narrate(`Snakes and Ladders! ${first.name}, you're up first. Roll the dice!`);
  },

  onAction(ctx, player, action) {
    const s = ctx.state;
    if (s.winner || action.control !== 'roll') return;
    if (player.id !== currentPlayer(ctx)) return; // not your turn

    const roll = 1 + Math.floor(Math.random() * 6);
    const name = player.name;
    let pos = s.positions[player.id] || 0;
    let narration = `${name} rolled a ${roll}. `;

    let next = pos + roll;
    if (next > 100) {
      // Need an exact landing on 100 — overshoot stays put (keeps games tense, not endless).
      narration += `That's too far past 100 — stay on ${pos}!`;
      next = pos;
    } else {
      pos = next;
      if (s.ladders[pos]) {
        narration += `Up the ladder from ${pos} to ${s.ladders[pos]}! Wheee!`;
        pos = s.ladders[pos];
      } else if (s.snakes[pos]) {
        narration += `Oh no, a snake! Slide down from ${pos} to ${s.snakes[pos]}.`;
        pos = s.snakes[pos];
      } else {
        narration += `Move to square ${pos}.`;
      }
    }

    s.positions[player.id] = pos;
    s.lastRoll = roll;
    s.lastMover = player.id;
    s.message = narration;

    if (pos >= 100) {
      s.winner = player.id;
      ctx.addScore(player.id, 1);
      narration += ` ${name} reached 100 and WINS! Hooray!`;
    } else {
      s.turnIndex = (s.turnIndex + 1) % s.order.length;
    }

    ctx.renderTV({ animateRoll: roll });
    ctx.narrate(narration);
    renderControllers(ctx);
  },
};
