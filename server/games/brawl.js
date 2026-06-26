// 🗡️💥 Roll the Brawl — a 2-player turn-based duel.
// Roll the dice → get a random weapon (or recharge a heart) → play the weapon's
// aiming mini-game → the defender gets a split-second to dodge (or kick dynamite
// back). Knock out all 3 hearts to win. Loser goes in the trash bin!
//
// Built on reusable pieces: the dice helper, the controller mini-game widgets
// (timing / flick / reaction), and the TV half-heart life bar.
import { rollDie } from '../lib/dice.js';
import { characterLibrary } from '../lib/characters.js';

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
  { id: 'hill', name: 'Easy Hill', emoji: '🌄' },
  { id: 'grotto', name: 'Powder-Keg Grotto', emoji: '🛢️' },
  { id: 'fjord', name: 'Icy Fjord', emoji: '🧊' },
  { id: 'volcano', name: 'Extreme Volcano', emoji: '🌋' },
];

// Fighter characters to choose from (until uploaded images land).
const ROSTER = ['🥷', '🧙', '🦸', '🦹', '🤖', '👹', '👺', '🧛', '🧟', '🤠', '🧞', '🐉', '🦖', '👻', '🦝', '🐲'];

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

// Pre-game: each fighter picks a character; anyone picks the world.
function startSetup(ctx) {
  clearTimer(ctx);
  const duel = ctx.players.slice(0, 2).map((p) => p.id);
  const chars = {}; const ready = {};
  for (const id of duel) { chars[id] = null; ready[id] = false; }
  ctx.state = {
    order: duel,
    phase: 'setup',
    chars,
    ready,
    world: WORLDS[0],
    dodgeMode: 'easy', // 'easy' = tap in time | 'tricky' = random mini-games
    maxHearts: MAX_HEARTS,
    lastEvent: null,
    message: 'Choose your fighter and your level!',
    winner: null,
  };
  render(ctx);
  ctx.narrate('Roll the Brawl! Pick your fighters and your level!');
}

// Start (or restart) the actual fight, keeping the chosen characters + world.
function beginBattle(ctx) {
  clearTimer(ctx);
  const s = ctx.state;
  s.hearts = {};
  for (const id of s.order) s.hearts[id] = MAX_HEARTS;
  s.turnIndex = 0;
  s.phase = 'roll';
  s.dice = null;
  s.weapon = null;
  s.pendingQuality = null;
  s.defenseToken = 0;
  s.seq = 0;
  s.lastEvent = null;
  s.winner = null;
  s.loser = null;
  s.message = `${name(ctx, s.order[0])} starts the brawl!`;
  render(ctx);
  ctx.narrate(`${name(ctx, s.order[0])} versus ${name(ctx, s.order[1])} at the ${s.world.name}. ${name(ctx, s.order[0])}, roll the dice!`);
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

const DODGE_KINDS = ['timing', 'mash', 'aim', 'catch'];

function startDefense(ctx, quality) {
  const s = ctx.state;
  s.phase = 'defense';
  s.pendingQuality = quality;
  s.defenseToken = ++s.seq;
  s.lastEvent = 'incoming';
  const hard = quality === 'perfect';
  if (s.dodgeMode === 'easy') {
    // Simple: tap Dodge (or Kick back) in time.
    s.dodge = { mode: 'easy', ms: hard ? 1300 : 1800 };
  } else {
    // Tricky: a RANDOM dodge challenge so it's never just one tap.
    s.dodge = {
      mode: 'tricky',
      kind: DODGE_KINDS[Math.floor(Math.random() * DODGE_KINDS.length)],
      ms: hard ? 1900 : 2500,         // tighter window for a perfect hit
      dir: ['⬅️', '⬆️', '➡️'][Math.floor(Math.random() * 3)],
      taps: hard ? 6 : 5,
      speed: hard ? 'hard' : 'easy',
    };
  }
  s.message = `${name(ctx, s.order[s.turnIndex])} attacks — ${WEAPONS[s.weapon].kickable ? 'kick it back' : 'dodge'}!`;
  render(ctx);
  // Backstop in case the defender's phone never answers.
  clearTimer(ctx);
  const token = s.defenseToken;
  ctx.room._brawlTimer = setTimeout(() => resolveDefense(ctx, 'toolate', token), s.dodge.ms + 2500);
}

function resolveDefense(ctx, response, token) {
  const s = ctx.state;
  if (s.phase !== 'defense' || s.defenseToken !== token) return; // stale / already resolved
  clearTimer(ctx);
  const att = s.order[s.turnIndex];
  const def = s.order[1 - s.turnIndex];
  const dmg = s.pendingQuality === 'perfect' ? 1 : 0.5;
  const weapon = WEAPONS[s.weapon];
  // Success: 'ok' (tricky challenge beaten) or a button press in time ('dodge'/'kickback').
  const success = response === 'ok' || response === 'dodge' || response === 'kickback';
  const wantsKickback = weapon.kickable && (response === 'kickback' || response === 'ok');

  let ended = false;
  if (success && wantsKickback) {
    s.lastEvent = 'kickback';
    s.message = `${name(ctx, def)} kicked the dynamite back at ${name(ctx, att)}! 🧨`;
    ctx.narrate(s.message);
    ended = applyDamage(ctx, att, dmg);
  } else if (success) {
    s.lastEvent = 'dodge';
    s.message = `${name(ctx, def)} pulled off the dodge!`;
    ctx.narrate(`${name(ctx, def)} dodged!`);
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
    if (s.phase === 'setup') {
      if (!s.order.includes(p.id)) return { title: '🥊 Roll the Brawl', subtitle: 'Watch the duel on the TV!', controls: [] };
      const other = s.order.find((id) => id !== p.id);
      const myChar = s.chars[p.id];
      if (s.ready[p.id]) {
        return { title: '✅ Ready!', subtitle: 'Waiting for your opponent…', controls: [{ type: 'text', value: `You: ${myChar} · Level: ${s.world.emoji} ${s.world.name}` }] };
      }
      const lib = characterLibrary();
      const charOptions = lib.length
        ? lib.map((c) => ({ id: c.token, label: c.name, img: c.url, disabled: s.chars[other] === c.token }))
        : ROSTER.map((e) => ({ id: e, label: e, disabled: s.chars[other] === e }));
      return {
        title: 'Pick your fighter!',
        subtitle: `Level: ${s.world.emoji} ${s.world.name}`,
        controls: [
          { type: 'choices', id: 'char', label: 'Your character:', selected: myChar, options: charOptions },
          { type: 'upload', id: 'charimg', label: (myChar && String(myChar).startsWith('img:')) ? '📷 Photo set ✓ — change?' : '📷 Upload your own' },
          { type: 'choices', id: 'world', label: 'Level / background:', selected: s.world.id, options: WORLDS.map((w) => ({ id: w.id, label: `${w.emoji} ${w.name}` })) },
          { type: 'choices', id: 'dodgemode', label: 'Dodge style:', selected: s.dodgeMode, options: [{ id: 'easy', label: '😊 Easy (tap in time)' }, { id: 'tricky', label: '😎 Tricky (mini-games)' }] },
          { type: 'button', id: 'ready', label: myChar ? '✅ Ready!' : '⬆️ Pick a character first', big: true, color: myChar ? '#22c55e' : '#94a3b8' },
        ],
      };
    }
    if (s.phase === 'over') {
      const won = s.winner === p.id;
      return {
        title: won ? '🏆 You WIN!' : '🗑️ KO!',
        subtitle: won ? 'Champion of the brawl!' : 'Into the trash bin you go…',
        controls: [
          { type: 'button', id: 'again', label: '🔁 Rematch', big: true, color: '#22c55e' },
          { type: 'button', id: 'setup', label: '⚙️ Change fighter / level', color: '#7c5cff' },
        ],
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
      const d = s.dodge;
      if (d.mode === 'easy') {
        // Simple: tap the button in time.
        const buttons = [{ id: 'dodge', label: '🦘 SUPER JUMP!', color: '#22c55e' }];
        if (w.kickable) buttons.push({ id: 'kickback', label: '🦵 KICK IT BACK!', color: '#ff6b6b' });
        return {
          title: '⚡ INCOMING!',
          subtitle: 'Tap in time!',
          controls: [{ type: 'reaction', id: 'defend', ms: d.ms, prompt: `${w.emoji} ${qualityWord(s.pendingQuality)} hit coming!`, buttons }],
        };
      }
      const verb = w.kickable ? '🦵 Kick it BACK!' : '🦘 DODGE!';
      const promptByKind = {
        timing: 'Tap when the marker is in the GREEN!',
        mash: 'MASH the button fast!',
        aim: `Jump ${d.dir} — tap the arrow!`,
        catch: 'Catch the target — tap it!',
      };
      return {
        title: '⚡ INCOMING!',
        subtitle: w.kickable ? 'Kick the dynamite back!' : 'Pull off the dodge!',
        controls: [{
          type: 'challenge', id: 'defend', kind: d.kind, ms: d.ms,
          dir: d.dir, taps: d.taps, speed: d.speed,
          prompt: `${verb} ${promptByKind[d.kind]}`,
        }],
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

  init(ctx) { startSetup(ctx); },

  onAction(ctx, player, action) {
    const s = ctx.state;
    if (s.phase === 'over') {
      if (action.control === 'again') beginBattle(ctx);   // rematch, same fighters/level
      else if (action.control === 'setup') startSetup(ctx); // change fighters/level
      return;
    }
    if (!s.order.includes(player.id)) return; // spectators can't act

    if (s.phase === 'setup') {
      if (action.control === 'char') {
        const allowed = new Set([...ROSTER, ...characterLibrary().map((c) => c.token)]);
        // can't take the other fighter's character
        const taken = s.order.some((id) => id !== player.id && s.chars[id] === action.value);
        if (allowed.has(action.value) && !taken) { s.chars[player.id] = action.value; render(ctx); }
      } else if (action.control === 'world') {
        const w = WORLDS.find((x) => x.id === action.value);
        if (w) { s.world = w; render(ctx); }
      } else if (action.control === 'dodgemode') {
        if (action.value === 'easy' || action.value === 'tricky') { s.dodgeMode = action.value; render(ctx); }
      } else if (action.control === 'ready') {
        if (s.chars[player.id]) s.ready[player.id] = true;
        if (s.order.every((id) => s.ready[id] && s.chars[id])) beginBattle(ctx);
        else render(ctx);
      }
      return;
    }
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
