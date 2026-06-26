# 🗡️💥 Roll the Brawl — Design Notes

A 2-player turn-based dueling game for the Family Arcade. Roll the dice to get a
weapon, play a quick mini-game to aim, and attack. Knock out your opponent's
hearts to win!

> Status: **designing on paper** — building starts once the kids' answers come back.

## Confirmed rules

- **Players:** 2 (a duel). Turn-based — player 1 rolls first, then alternate.
- **A turn:** roll the dice → get a **random weapon** → play the weapon's aiming
  mini-game → attack. Then it's the other player's turn.
- **Hearts:** 3 hearts each, with **half-heart** precision (6 half-pips).
  - Miss = **0**
  - Minor / small hit = **½ heart**
  - Perfect hit = **1 heart**
  - (3 perfect hits, or 6 small hits, to win.)
- **Dice (6 faces):** 1 Sword · 2 Axe · 3 Bow · 4 Dynamite · 5 Wild (random weapon)
  · 6 **+1 Heart** (recharge, capped at 3; if already full you get a random weapon instead).
- **Weapons (4):** sword, axe, dynamite, bow & arrow. Each is **different** —
  its own aiming mini-game + a special power. (Same damage scale above.)
- **Aiming mini-games:** quick skill games like *tap when it's green* or
  *flick/swipe*, deciding miss / minor / perfect (kid-friendly words).
- **Secret moves (defender reacts during the attacker's swing):**
  - **Super jump** — quick reaction tap to **dodge any attack**.
  - **Kick back** — quick reaction tap, **only works on dynamite** (sends it back!).
  - Timing-based: a short window pops up; tap in time or you get hit.
- **Win:** TV cheers the winner; the loser gets thrown into a trash bin. 🗑️
- **Worlds / backgrounds:** Easy Hill → Powder-Keg Grotto → Icy Fjord → Extreme Volcano.
- **Characters:** players upload images. A setup screen gives a canvas with
  **rotate / shrink / flip** to aim the character forward; the game **auto-mirrors**
  it so the two fighters always face each other.

## Open questions (for the kids to answer)

- **Per weapon** (sword, axe, bow, dynamite): easy or tricky to aim? mini-game =
  tap-green or flick? special power? Which weapon is strongest / hardest / easiest?
- **Dice:** there are 4 weapons but 6 dice faces — what do **5** and **6** do?
- **Worlds:** just backgrounds, or does each have a twist? Pick / random / climb
  through them?
- **Characters:** each player uploads their own, or pick from a shared box?
- **First turn:** player 1 always, random, or coin flip?
- **Celebrations:** what does the TV do/say on a win? the trash-bin toss? what
  does it say on a perfect hit / miss / dodge?

## Reusable foundations (built for other games too)

These are built as shared pieces, not Brawl-only:
- **Mini-game widgets** (controller protocol): `timing` (tap-when-green),
  `flick` (swipe), and `reaction` (time-limited dodge/choice). Any game can use
  them — they grade to a result the game reads.
- **Half-heart life bar** (`renderHearts`) on the TV — any game with lives.
- **Dice** helper (`server/lib/dice.js`).
- **Themed backgrounds** on the TV stage (worlds).

## Build plan (staged)

1. Duel skeleton: 2 players, turn order, hearts (half-heart) UI, win/lose + trash bin.
2. One weapon end-to-end (roll → aim mini-game → hit resolution → damage).
3. Remaining weapons + their mini-games and special powers.
4. Secret moves (super jump dodge, dynamite kick-back) with reaction windows.
5. Worlds / backgrounds.
6. Character upload + editor (rotate/shrink/flip) + auto-mirror.
