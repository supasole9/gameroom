// Lāʻie & Kahuku — a Monopoly-lite (Monopoly Junior style) board game themed
// around the real towns of Lāʻie and Kahuku on Oʻahu's North Shore.
//
// Design notes:
// - Small, kid-friendly money. Roll one die, move, buy on landing or pay rent.
// - Owning a whole colour group doubles its rent (light strategy).
// - The Lāʻie Hawaiʻi Temple is a sacred place, so it's a peaceful "rest" space
//   you can't buy or charge rent on — out of respect for the real community.
// - The game ends the moment any player can't pay (or after a turn cap); the
//   RICHEST player by net worth wins. That way everyone plays the whole game
//   and nobody is eliminated early.

const START_CASH = 25;
const GO_PAY = 3;

// 24-space loop. Corners at 0, 6, 12, 18. type: go|prop|chance|rest|loseturn.
const BOARD = [
  { i: 0, type: 'go', name: 'Lāʻie', emoji: '🌺' },
  { i: 1, type: 'prop', name: 'Hukilau Beach', group: 'beaches', color: '#22d3ee', price: 2, rent: 1, emoji: '🏖️' },
  { i: 2, type: 'prop', name: 'Pounders Beach', group: 'beaches', color: '#22d3ee', price: 2, rent: 1, emoji: '🌊' },
  { i: 3, type: 'mystery', deck: 'hukilau', name: 'Hukilau Card', emoji: '🃏' },
  { i: 4, type: 'prop', name: 'Lāʻie Point', group: 'sights', color: '#2dd4bf', price: 3, rent: 1, emoji: '🪨' },
  { i: 5, type: 'prop', name: 'Hukilau Marketplace', group: 'shops', color: '#fb923c', price: 3, rent: 1, emoji: '🛍️' },
  { i: 6, type: 'rest', name: 'Lāʻie Temple', emoji: '🕊️', note: 'Rest & reflect' },
  { i: 7, type: 'prop', name: 'Polynesian Cultural Center', group: 'attractions', color: '#a78bfa', price: 5, rent: 3, emoji: '🪘' },
  { i: 8, type: 'prop', name: 'Gunstock Ranch', group: 'country', color: '#4ade80', price: 4, rent: 2, emoji: '🐎' },
  { i: 9, type: 'mystery', deck: 'talkstory', name: 'Talk-Story Card', emoji: '🎁' },
  { i: 10, type: 'prop', name: 'Mālaekahana Beach', group: 'beaches', color: '#22d3ee', price: 3, rent: 2, emoji: '🏕️' },
  { i: 11, type: 'prop', name: 'Cackle Fresh Egg Farm', group: 'farms', color: '#facc15', price: 3, rent: 1, emoji: '🥚' },
  { i: 12, type: 'rest', name: 'Beach Day!', emoji: '☀️', note: 'Relax — nothing happens' },
  { i: 13, type: 'prop', name: 'Kahuku Sugar Mill', group: 'shops', color: '#fb923c', price: 4, rent: 2, emoji: '🏭' },
  { i: 14, type: 'prop', name: "Giovanni's Shrimp Truck", group: 'shrimp', color: '#f87171', price: 5, rent: 3, emoji: '🍤' },
  { i: 15, type: 'prop', name: "Romy's Kahuku Prawns", group: 'shrimp', color: '#f87171', price: 5, rent: 3, emoji: '🦐' },
  { i: 16, type: 'mystery', deck: 'hukilau', name: 'Hukilau Card', emoji: '🃏' },
  { i: 17, type: 'prop', name: 'Kahuku Farms', group: 'farms', color: '#facc15', price: 4, rent: 2, emoji: '🥭' },
  { i: 18, type: 'loseturn', name: 'Shrimp Truck Line!', emoji: '⏳', note: 'Such a long line — lose a turn' },
  { i: 19, type: 'prop', name: 'Kahuku Golf Course', group: 'country', color: '#4ade80', price: 5, rent: 2, emoji: '⛳' },
  { i: 20, type: 'prop', name: 'Amorient Aquafarm', group: 'farms', color: '#facc15', price: 4, rent: 2, emoji: '🐟' },
  { i: 21, type: 'mystery', deck: 'talkstory', name: 'Talk-Story Card', emoji: '🎁' },
  { i: 22, type: 'prop', name: 'Kahuku Point', group: 'sights', color: '#2dd4bf', price: 5, rent: 2, emoji: '🐢' },
  { i: 23, type: 'prop', name: 'Turtle Bay Resort', group: 'attractions', color: '#a78bfa', price: 6, rent: 3, emoji: '🏨' },
];

// Two decks of mystery cards, à la Monopoly's Chance / Community Chest.
// Effects: money (+/- from bank), moveTo (advance & resolve), back (& resolve),
// toJail (the shrimp-truck line), collectEach / payEach (player to player).
const HUKILAU = [ // adventurous — movement & events
  { text: 'Drive back to Lāʻie 🚙 — advance to START!', moveTo: 0 },
  { text: 'Catch a free show at the PCC 🪘 — advance there.', moveTo: 7 },
  { text: 'Sunset at Turtle Bay 🌅 — advance to Turtle Bay Resort.', moveTo: 23 },
  { text: "Garlic shrimp craving 🍤 — advance to Giovanni's Shrimp Truck.", moveTo: 14 },
  { text: 'Took a wrong turn on Kam Hwy 🔄 — go back 3 spaces.', back: 3 },
  { text: 'Caught in the shrimp truck line! 🍤 Go straight there.', toJail: true },
  { text: 'You caught a big wave at Pounders! 🏄 Collect $2.', money: 2 },
  { text: 'Speeding ticket on Kam Highway 🚓 — pay $2.', money: -2 },
  { text: 'Found a honu at Lāʻie Point 🐢 — collect $1.', money: 1 },
  { text: 'Shave ice treat 🍧 — pay $1.', money: -1 },
];
const TALKSTORY = [ // community & money
  { text: 'Won the hukilau! 🐟 The town shares the catch — collect $3.', money: 3 },
  { text: "It's your birthday! 🎂 Each friend gives you $1.", collectEach: 1 },
  { text: 'Shave ice for everyone! 🍧 Pay each player $1.', payEach: 1 },
  { text: 'Helped clean Hukilau Beach 🧹 — collect $2.', money: 2 },
  { text: 'Found money in your slippahs 🩴 — collect $2.', money: 2 },
  { text: 'Plate lunch for the family 🍱 — pay $2.', money: -2 },
  { text: 'Sold mangoes at the farm stand 🥭 — collect $2.', money: 2 },
  { text: 'Malasada Friday! 🍩 — pay $1.', money: -1 },
  { text: 'Community lūʻau fundraiser 🎉 — collect $1.', money: 1 },
  { text: 'Lost your beach towel at the beach 🏖️ — pay $1.', money: -1 },
];
const DECKS = {
  hukilau: { name: 'Hukilau Card', cards: HUKILAU },
  talkstory: { name: 'Talk-Story Card', cards: TALKSTORY },
};

function groupMembers(group) { return BOARD.filter((s) => s.group === group).map((s) => s.i); }
function ownsAllGroup(state, owner, group) {
  return groupMembers(group).every((i) => state.owners[i] === owner);
}
function rentFor(state, i) {
  const s = BOARD[i];
  const base = s.rent;
  return ownsAllGroup(state, state.owners[i], s.group) ? base * 2 : base;
}
function netWorth(state, cid) {
  let w = state.cash[cid] || 0;
  for (const i in state.owners) if (state.owners[i] === cid) w += BOARD[i].price;
  return w;
}
function name(ctx, cid) { return ctx.players.find((p) => p.id === cid)?.name || 'Player'; }
function connectedIds(ctx) { return new Set(ctx.players.map((p) => p.id)); }
function currentCid(ctx) { return ctx.state.order[ctx.state.turnIndex]; }

function leaderboard(ctx) {
  return ctx.state.order.map((cid) => ({
    id: cid,
    cash: ctx.state.cash[cid] || 0,
    worth: netWorth(ctx.state, cid),
    props: Object.values(ctx.state.owners).filter((o) => o === cid).length,
  }));
}

function startGame(ctx) {
  const order = ctx.players.map((p) => p.id);
  const cash = {}; const positions = {}; const loseTurn = {};
  for (const id of order) { cash[id] = START_CASH; positions[id] = 0; loseTurn[id] = false; }
  ctx.state = {
    board: BOARD,
    order,
    turnIndex: 0,
    positions,
    cash,
    owners: {}, // spaceIndex -> cid
    loseTurn,
    phase: 'roll', // roll | decide | over
    pending: null, // { space }
    dice: null,
    message: `${name(ctx, order[0])} starts in Lāʻie!`,
    card: null,
    winner: null,
    turnCount: 0,
    maxTurns: order.length * 14,
  };
  ctx.renderTV();
  renderControllers(ctx);
  ctx.narrate(`Welcome to Lāʻie and Kahuku! ${name(ctx, order[0])}, roll the dice to start.`);
}

function endGame(ctx, reason) {
  const s = ctx.state;
  const board = leaderboard(ctx).slice().sort((a, b) => b.worth - a.worth || b.cash - a.cash);
  const winnerId = board[0].id;
  s.phase = 'over';
  s.winner = winnerId;
  s.message = reason;
  ctx.addScore(winnerId, 1);
  ctx.renderTV();
  renderControllers(ctx);
  ctx.narrate(`${reason} The richest in Lāʻie and Kahuku is ${name(ctx, winnerId)}. Congratulations!`);
}

function advanceTurn(ctx) {
  const s = ctx.state;
  s.phase = 'roll';
  s.pending = null;
  const connected = connectedIds(ctx);
  if (s.turnCount >= s.maxTurns) { endGame(ctx, 'Time to head home — the game is over!'); return; }

  let tries = 0;
  do {
    s.turnIndex = (s.turnIndex + 1) % s.order.length;
    const cid = s.order[s.turnIndex];
    if (!connected.has(cid)) { tries++; continue; } // skip players who left
    if (s.loseTurn[cid]) {
      s.loseTurn[cid] = false;
      s.message = `${name(ctx, cid)} is still in the shrimp truck line — turn skipped!`;
      ctx.narrate(s.message);
      tries++;
      continue;
    }
    break;
  } while (tries < s.order.length * 2);

  ctx.renderTV();
  renderControllers(ctx);
}

function others(ctx, cid) { return ctx.players.map((p) => p.id).filter((id) => id !== cid); }

// Draw and apply a mystery card. `depth` guards against move-cards chaining
// endlessly through other mystery spaces.
function drawMystery(ctx, cid, deckName, depth) {
  const s = ctx.state;
  const deck = DECKS[deckName];
  const card = deck.cards[Math.floor(Math.random() * deck.cards.length)];
  s.card = { title: deck.name, text: card.text, deck: deckName };
  ctx.narrate(`${deck.name}: ${card.text}`);

  if (typeof card.money === 'number') {
    if (card.money < 0 && s.cash[cid] < -card.money) {
      endGame(ctx, `${name(ctx, cid)} couldn't pay the ${deck.name}!`);
      return;
    }
    s.cash[cid] += card.money;
    s.message = `${name(ctx, cid)}: ${card.text}`;
    return advanceTurn(ctx);
  }
  if (typeof card.collectEach === 'number') {
    let got = 0;
    for (const oid of others(ctx, cid)) {
      const pay = Math.min(card.collectEach, s.cash[oid]); // can't bleed others dry below 0
      s.cash[oid] -= pay; s.cash[cid] += pay; got += pay;
    }
    s.message = `${name(ctx, cid)} collected $${got} from everyone!`;
    return advanceTurn(ctx);
  }
  if (typeof card.payEach === 'number') {
    const o = others(ctx, cid);
    const total = card.payEach * o.length;
    if (s.cash[cid] < total) { endGame(ctx, `${name(ctx, cid)} couldn't treat everyone!`); return; }
    for (const oid of o) { s.cash[cid] -= card.payEach; s.cash[oid] += card.payEach; }
    s.message = `${name(ctx, cid)} paid everyone $${card.payEach}.`;
    return advanceTurn(ctx);
  }
  if (card.toJail) {
    s.positions[cid] = 18; // the shrimp-truck line corner
    s.loseTurn[cid] = true;
    s.message = `${name(ctx, cid)} is stuck in the shrimp truck line!`;
    return advanceTurn(ctx);
  }
  if (typeof card.moveTo === 'number') {
    if (card.moveTo <= s.positions[cid]) s.cash[cid] += GO_PAY; // passed START
    s.positions[cid] = card.moveTo;
    if (depth >= 2) return advanceTurn(ctx);
    return resolveLanding(ctx, cid, depth + 1);
  }
  if (typeof card.back === 'number') {
    s.positions[cid] = (s.positions[cid] - card.back + BOARD.length) % BOARD.length;
    if (depth >= 2) return advanceTurn(ctx);
    return resolveLanding(ctx, cid, depth + 1);
  }
  return advanceTurn(ctx);
}

function resolveLanding(ctx, cid, depth = 0) {
  const s = ctx.state;
  const pos = s.positions[cid];
  const space = BOARD[pos];

  if (space.type === 'go') {
    s.message = `${name(ctx, cid)} is relaxing in Lāʻie.`;
    return advanceTurn(ctx);
  }
  if (space.type === 'rest') {
    s.message = `${name(ctx, cid)} stops at ${space.name}. ${space.note}.`;
    ctx.narrate(s.message);
    return advanceTurn(ctx);
  }
  if (space.type === 'loseturn') {
    s.loseTurn[cid] = true;
    s.message = `${name(ctx, cid)} got stuck in the shrimp truck line! 🍤`;
    ctx.narrate(s.message);
    return advanceTurn(ctx);
  }
  if (space.type === 'mystery') {
    return drawMystery(ctx, cid, space.deck, depth);
  }

  // property
  const owner = s.owners[pos];
  if (!owner) {
    if (s.cash[cid] >= space.price) {
      s.phase = 'decide';
      s.pending = { space: pos };
      s.message = `${name(ctx, cid)} landed on ${space.name}.`;
      ctx.renderTV();
      renderControllers(ctx);
      return;
    }
    s.message = `${name(ctx, cid)} can't afford ${space.name} ($${space.price}).`;
    ctx.narrate(`${name(ctx, cid)} landed on ${space.name}, but can't afford it.`);
    return advanceTurn(ctx);
  }
  if (owner === cid) {
    s.message = `${name(ctx, cid)} is back home at ${space.name}.`;
    return advanceTurn(ctx);
  }
  // pay rent
  const rent = rentFor(s, pos);
  if (s.cash[cid] < rent) {
    endGame(ctx, `${name(ctx, cid)} couldn't pay $${rent} rent at ${space.name}!`);
    return;
  }
  s.cash[cid] -= rent;
  s.cash[owner] += rent;
  s.message = `${name(ctx, cid)} paid $${rent} rent to ${name(ctx, owner)} at ${space.name}.`;
  ctx.narrate(s.message);
  return advanceTurn(ctx);
}

function renderControllers(ctx) {
  const s = ctx.state;
  const curId = currentCid(ctx);
  ctx.renderControllers((p) => {
    const cash = s.cash[p.id] || 0;
    const myPropNames = Object.entries(s.owners).filter(([, o]) => o === p.id).map(([i]) => BOARD[i].name);
    const myCount = myPropNames.length;

    if (s.phase === 'over') {
      const won = s.winner === p.id;
      return {
        title: won ? '🏆 You win!' : `🏆 ${name(ctx, s.winner)} wins!`,
        subtitle: `You finished with $${cash}`,
        controls: [{ type: 'button', id: 'again', label: '🔁 Play Again', big: true, color: '#22c55e' }],
      };
    }

    if (p.id === curId) {
      if (s.phase === 'decide') {
        const sp = BOARD[s.pending.space];
        return {
          title: `Buy ${sp.name}?`,
          subtitle: `${sp.emoji} $${sp.price} · rent $${sp.rent} — you have $${cash}`,
          controls: [
            { type: 'button', id: 'buy', label: `🤑 Buy for $${sp.price}`, big: true, color: '#22c55e' },
            { type: 'button', id: 'skip', label: '👋 No thanks', color: '#94a3b8' },
          ],
        };
      }
      return {
        title: '🎲 Your turn!',
        subtitle: `You have $${cash}${myCount ? ` · ${myCount} ${myCount === 1 ? 'place' : 'places'}` : ''}`,
        controls: [{ type: 'button', id: 'roll', label: '🎲 Roll the dice', big: true, color: '#ff6b6b' }],
      };
    }

    return {
      title: `${name(ctx, curId)}'s turn`,
      subtitle: `You have $${cash}`,
      controls: [{ type: 'text', value: myCount ? `You own: ${myPropNames.join(', ')}` : 'No properties yet — keep rolling!' }],
    };
  });
}

export default {
  id: 'laie',
  name: 'Lāʻie & Kahuku',
  emoji: '🏝️',
  minPlayers: 2,
  maxPlayers: 6,
  blurb: 'Monopoly-lite around the North Shore! Buy shrimp trucks, beaches & more.',

  sync(ctx) {
    ctx.renderTV();
    renderControllers(ctx);
  },

  init(ctx) {
    startGame(ctx);
  },

  onAction(ctx, player, action) {
    const s = ctx.state;
    if (s.phase === 'over') {
      if (action.control === 'again') startGame(ctx);
      return;
    }
    if (player.id !== currentCid(ctx)) return; // only the active player acts

    if (s.phase === 'roll' && action.control === 'roll') {
      const die = 1 + Math.floor(Math.random() * 6);
      s.dice = die;
      s.card = null;
      s.turnCount++;
      const from = s.positions[player.id];
      const moved = from + die;
      if (moved >= BOARD.length) s.cash[player.id] += GO_PAY; // passed START
      s.positions[player.id] = moved % BOARD.length;
      ctx.renderTV({ animateRoll: die });
      ctx.narrate(`${name(ctx, player.id)} rolled a ${die}.`);
      resolveLanding(ctx, player.id);
      return;
    }

    if (s.phase === 'decide') {
      const pos = s.pending.space;
      const sp = BOARD[pos];
      if (action.control === 'buy' && s.cash[player.id] >= sp.price) {
        s.cash[player.id] -= sp.price;
        s.owners[pos] = player.id;
        s.message = `${name(ctx, player.id)} bought ${sp.name}!`;
        ctx.narrate(`${name(ctx, player.id)} bought ${sp.name}!`);
      } else {
        s.message = `${name(ctx, player.id)} passed on ${sp.name}.`;
      }
      advanceTurn(ctx);
    }
  },
};
