// 🗡️💥 Roll the Brawl — a 2-player turn-based duel.
// Roll the dice → get a random weapon (or recharge a heart) → play the weapon's
// aiming mini-game → the defender gets a split-second to dodge (or kick dynamite
// back). Knock out all 3 hearts to win. Loser goes in the trash bin!
//
// Built on reusable pieces: the dice helper, the controller mini-game widgets
// (timing / flick / reaction), and the TV half-heart life bar.
import { rollDie } from '../lib/dice.js';

const MAX_HEARTS = 3;

// Each weapon: its aiming mini-game + special trait. Same damage scale
// (small ½ / perfect 1); they differ in feel. Tune as the kids decide.
const WEAPONS = {
  sword: { name: 'Sword', emoji: '⚔️', mini: 'timing', difficulty: 'easy', kickable: false, aimLabel: 'Tap when the marker hits the GREEN — middle is PERFECT!' },
  axe: { name: 'Axe', emoji: '🪓', mini: 'timing', difficulty: 'hard', kickable: false, aimLabel: 'Heavy & fast! Tap in the GREEN for a perfect chop!' },
  bow: { name: 'Bow & Arrow', emoji: '🏹', mini: 'flick', difficulty: 'easy', kickable: false, aimLabel: 'FLICK UP fast to shoot a perfect shot!' },
  dynamite: { name: 'Dynamite', emoji: '🧨', mini: 'timing', difficulty: 'easy', kickable: true, aimLabel: 'Tap in the GREEN to throw it just right!' },
};
// die face (1-6) -> outcome
const FACES = ['sword', 'axe', 'bow', 'dynamite', 'wild', 'heal'];

const WORLDS = [
  { id: 'hill', name: 'Easy Hill' },
  { id: 'grotto', name: 'Powder-Keg Grotto' },
  { id: 'fjord', name: 'Icy Fjord' },
  { id: 'volcano', name: 'Extreme Volcano' },
];

const clampHearts = (v) => Math.max(0, Math.round(v * 2) / 2);
const name = (ctx, cid) => ctx.players.find((p) => p.id === cid)?.name || 'Player';
const qualityWord = (q) => (q === 'perfect' ? 'Perfect' : q === 'minor' ? 'Small' : 'Miss');

function render(ctx, extra = {}) {
  ctx.renderTV(extra);
  renderControllers(ctx);
}

function clearTimer(ctx) {
  if (ctx.room._brawlTimer) { clearTimeout(ctx.room._brawlTimer); ctx.room._brawlTimer = null; }
}

function startGame(ctx) {
  clearTimer(ctx);
  const duel = ctx.players.slice(0, 2).map((p) => p.id);
  const hearts = {};
  for (const id of duel) hearts[id] = MAX_HEARTS;
  const world = WORLDS[Math.floor(Math.random() * WORLDS.length)];
  ctx.state = {
    order: duel,         // [leftFighter, rightFighter]
    turnIndex: 0,        // 0 or 1 — whose turn (attacker)
    hearts,
    maxHearts: MAX_HEARTS,
    world,
    phase: 'roll',       // roll | aim | defense | over
    dice: null,
    weapon: null,
    pendingQuality: null,
    defenseToken: 0,
    seq: 0,
    lastEvent: null,     // weapon | miss | hit | dodge | kickback | heal | win
    message: `${name(ctx, duel[0])} starts the brawl!`,
    winner: null,
  };
  render(ctx);
  ctx.narrate(`Roll the Brawl! ${name(ctx, duel[0])} versus ${name(ctx, duel[1])} at the ${world.name}. ${name(ctx, duel[0])}, roll the dice!`);
}

function endGame(ctx, winnerId) {
  clearTimer(ctx);
  const s = ctx.state;
  s.phase = 'over';
  s.winner = winnerId;
  s.loser = s.order.find((id) => id !== winnerId);
  s.lastEvent = 'win';
  s.message = `${name(ctx, winnerId)} wins the brawl!`;
  ctx.addScore(winnerId, 1);
  render(ctx);
  ctx.narrate(`${name(ctx, winnerId)} WINS! Into the trash bin you go, ${name(ctx, s.loser)}!`);
}

// Returns true if the game ended.
function applyDamage(ctx, targetId, dmg) {
  const s = ctx.state;
  s.hearts[targetId] = clampHearts(s.hearts[targetId] - dmg);
  if (s.hearts[targetId] <= 0) {
    endGame(ctx, s.order.find((id) => id !== targetId));
    return true;
  }
  return false;
}

function advanceTurn(ctx) {
  const s = ctx.state;
  s.turnIndex = 1 - s.turnIndex;
  s.phase = 'roll';
  s.weapon = null;
  s.pendingQuality = null;
  render(ctx);
}

function startDefense(ctx, quality) {
  const s = ctx.state;
  s.phase = 'defense';
  s.pendingQuality = quality;
  s.defenseToken = ++s.seq;
  s.lastEvent = 'incoming';
  s.message = `${name(ctx, s.order[s.turnIndex])} lands a ${qualityWord(quality).toLowerCase()} hit — react!`;
  render(ctx);
  // Backstop in case the defender's phone never answers (a bit longer than the
  // client reaction window so the phone normally drives the result).
  const windowMs = quality === 'perfect' ? 1300 : 1700;
  clearTimer(ctx);
  const token = s.defenseToken;
  ctx.room._brawlTimer = setTimeout(() => resolveDefense(ctx, 'toolate', token), windowMs + 2000);
}

function resolveDefense(ctx, response, token) {
  const s = ctx.state;
  if (s.phase !== 'defense' || s.defenseToken !== token) return; // stale / already resolved
  clearTimer(ctx);
  const att = s.order[s.turnIndex];
  const def = s.order[1 - s.turnIndex];
  const dmg = s.pendingQuality === 'perfect' ? 1 : 0.5;
  const weapon = WEAPONS[s.weapon];

  let ended = false;
  if (response === 'dodge') {
    s.lastEvent = 'dodge';
    s.message = `${name(ctx, def)} super-jumped and DODGED!`;
    ctx.narrate(`${name(ctx, def)} dodged!`);
  } else if (response === 'kickback' && weapon.kickable) {
    s.lastEvent = 'kickback';
    s.message = `${name(ctx, def)} kicked the dynamite back at ${name(ctx, att)}! 🧨`;
    ctx.narrate(s.message);
    ended = applyDamage(ctx, att, dmg);
  } else {
    s.lastEvent = 'hit';
    s.message = `${qualityWord(s.pendingQuality)} hit on ${name(ctx, def)}!`;
    ctx.narrate(s.message);
    ended = applyDamage(ctx, def, dmg);
  }
  if (!ended) advanceTurn(ctx);
}

function doRoll(ctx, att) {
  const s = ctx.state;
  s.lastEvent = null;
  const die = rollDie();
  s.dice = die;
  let outcome = FACES[die - 1];

  if (outcome === 'heal') {
    if (s.hearts[att] < MAX_HEARTS) {
      s.hearts[att] = clampHearts(s.hearts[att] + 1);
      s.lastEvent = 'heal';
      s.message = `${name(ctx, att)} rolled a ${die} and recharged a heart! ❤️`;
      ctx.narrate(`${name(ctx, att)} recharged a heart!`);
      render(ctx, { animateRoll: die });
      return advanceTurn(ctx);
    }
    outcome = 'wild'; // already full — get a weapon instead of wasting the roll
  }
  if (outcome === 'wild') outcome = ['sword', 'axe', 'bow', 'dynamite'][Math.floor(Math.random() * 4)];

  s.weapon = outcome;
  s.phase = 'aim';
  s.lastEvent = 'weapon';
  s.message = `${name(ctx, att)} rolled a ${die} — got the ${WEAPONS[outcome].name}!`;
  ctx.narrate(`${name(ctx, att)} got the ${WEAPONS[outcome].name}!`);
  render(ctx, { animateRoll: die });
}

function renderControllers(ctx) {
  const s = ctx.state;
  const att = s.order[s.turnIndex];
  const def = s.order[1 - s.turnIndex];
  ctx.renderControllers((p) => {
    if (!s.order.includes(p.id)) {
      return { title: '🥊 Roll the Brawl', subtitle: 'Watch the duel on the TV!', controls: [] };
    }
    if (s.phase === 'over') {
      const won = s.winner === p.id;
      return {
        title: won ? '🏆 You WIN!' : '🗑️ KO!',
        subtitle: won ? 'Champion of the brawl!' : 'Into the trash bin you go…',
        controls: [{ type: 'button', id: 'again', label: '🔁 Rematch', big: true, color: '#22c55e' }],
      };
    }
    const hp = `❤️ ${s.hearts[p.id]}`;
    if (p.id === att) {
      if (s.phase === 'roll') {
        return { title: '🎲 Your turn!', subtitle: `You: ${hp}`, controls: [{ type: 'button', id: 'roll', label: '🎲 ROLL', big: true, color: '#ff6b6b' }] };
      }
      if (s.phase === 'aim') {
        const w = WEAPONS[s.weapon];
        const mini = w.mini === 'flick'
          ? { type: 'flick', id: 'attack', label: w.aimLabel }
          : { type: 'timing', id: 'attack', speed: w.difficulty, label: w.aimLabel, color: '#ff6b6b' };
        return { title: `${w.emoji} ${w.name}!`, subtitle: 'Aim your attack!', controls: [mini] };
      }
      return { title: '💥 Attacking!', subtitle: 'Will they dodge?', controls: [{ type: 'text', value: '…' }] };
    }
    // defender
    if (s.phase === 'defense') {
      const w = WEAPONS[s.weapon];
      const buttons = [{ id: 'dodge', label: '🦘 SUPER JUMP!', color: '#22c55e' }];
      if (w.kickable) buttons.push({ id: 'kickback', label: '🦵 KICK IT BACK!', color: '#ff6b6b' });
      return {
        title: '⚡ INCOMING!',
        subtitle: 'React fast!',
        controls: [{ type: 'reaction', id: 'defend', ms: (s.pendingQuality === 'perfect' ? 1300 : 1700), prompt: `${w.emoji} ${qualityWord(s.pendingQuality)} hit coming!`, buttons }],
      };
    }
    if (s.phase === 'aim') {
      const w = WEAPONS[s.weapon];
      return { title: '🛡️ Watch out!', subtitle: `${name(ctx, att)} has a ${w.name}!`, controls: [{ type: 'text', value: 'Get ready to react…' }] };
    }
    return { title: `${name(ctx, att)}'s turn`, subtitle: `You: ${hp}`, controls: [{ type: 'text', value: 'Waiting for their roll…' }] };
  });
}

export default {
  id: 'brawl',
  name: 'Roll the Brawl',
  emoji: '🗡️',
  minPlayers: 2,
  maxPlayers: 6,
  blurb: '2-player duel! Roll for a weapon, aim your hit, dodge theirs. Last one standing wins!',

  sync(ctx) { render(ctx); },

  init(ctx) { startGame(ctx); },

  onAction(ctx, player, action) {
    const s = ctx.state;
    if (s.phase === 'over') {
      if (action.control === 'again') startGame(ctx);
      return;
    }
    if (!s.order.includes(player.id)) return; // spectators can't act
    const att = s.order[s.turnIndex];
    const def = s.order[1 - s.turnIndex];

    if (s.phase === 'roll' && action.control === 'roll' && player.id === att) {
      doRoll(ctx, att);
    } else if (s.phase === 'aim' && action.control === 'attack' && player.id === att) {
      const q = action.value;
      if (!['perfect', 'minor', 'miss'].includes(q)) return;
      if (q === 'miss') {
        s.lastEvent = 'miss';
        s.message = `${name(ctx, att)} swung and MISSED!`;
        ctx.narrate(s.message);
        advanceTurn(ctx);
      } else {
        startDefense(ctx, q);
      }
    } else if (s.phase === 'defense' && action.control === 'defend' && player.id === def) {
      resolveDefense(ctx, action.value, s.defenseToken);
    }
  },
};
