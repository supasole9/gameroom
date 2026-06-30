# Jeopardy "Buzz Room" — Design

A Jackbox-style trivia game for the Family Arcade. The **TV** shows a Jeopardy
board and reveals questions; every **phone** is a buzzer. Multiple-choice
answers. First to buzz locks everyone else out.

## Core loop

1. **Setup** — on the TV, pick 2–4 categories from the catalogue. They become
   the board's columns.
2. **Board** — categories across the top × 5 rows worth `100/200/300/400/500`.
   The **picker** chooses a tile.
3. **Reveal** — the chosen question types out word-by-word on the TV. All 4
   answer choices are visible from the start. Every phone shows a big 🔴 BUZZ
   button.
4. **Buzz** — first buzz wins (server-timestamped). Everyone else is frozen. The
   buzzer's phone swaps BUZZ → the 4 choices; others see "{name} is answering…".
5. **Score** — correct = +tile value and that player becomes the next picker;
   wrong/timeout = −tile value, that phone is locked out, and the question
   **re-opens** for the remaining players to buzz.
6. **End** — board empty → highest score wins; the TV celebrates.

## Detailed rules

### Picker
- Picker = whoever last answered correctly.
- Game starts with the first connected player as picker.
- If nobody answers a question correctly, the picker keeps the pick.
- The picker's phone renders the available tiles as `choices` (label = category
  + value); the TV shows the big glowing grid. Other phones show "Watch the TV
  — {picker} is choosing."

### Reveal + buzz
- Word-by-word reveal driven by a server interval (~3 words/sec). The 4 choices
  are shown immediately so a player can buzz the moment they know it.
- All connected, non-locked-out phones show one big **🔴 BUZZ** button during a
  reveal.
- First buzz wins. The server records buzz order; the first received locks the
  question and ignores later buzzes. The TV freezes the text, plays a buzz
  sound, and shows "{name} buzzed!".
- Answer clock: **10 seconds** after buzz. Timeout is treated as a wrong answer.

### Shared device — split buzz
We support multiple player seats per device (pass-and-play). So two people can
hold opposite ends of one phone and race to buzz:

- During `reveal`, if a device holds **2+ seats**, the controller renders **one
  BUZZ button per seat, stacked** (top half = seat A, bottom half = seat B,
  tuned for 2; 3–4 seats degrade to a smaller stack). Each end taps its own
  seat.
- Whichever end is tapped first → that **seat** buzzes; the server attributes
  the buzz to the correct player and the device flips to that seat's answer
  choices (the existing one-interactive-seat auto-switch handles this).
- A single-seat device shows one full-screen BUZZ button, as today.
- This is the one place the controller's normal one-seat-at-a-time rendering is
  overridden: during a buzz, all local seats render simultaneously.

### Scoring (classic lockout)
- **Correct** → +tile value; buzzer becomes the next picker; advance.
- **Wrong or timeout** → −tile value; that phone locked out for this tile; the
  question re-opens (text already fully shown) for remaining players to buzz.
- **Everyone misses / nobody buzzes** within the reveal-plus-grace window → the
  TV reveals the correct answer, no score changes, same picker continues.
- Scores **floor at 0** — a wrong answer never pushes a player below zero.

## Data — built-in packs

`server/games/jeopardy/packs.js` exports the category catalogue. Each category:

```js
{
  id: 'cars',
  name: 'Cars',
  emoji: '🏎️',
  questions: [
    { q: 'What is Lightning McQueen\'s racing number?', choices: ['95', '43', '7', '51'], answer: 0 },
    // ... 5+ per category
  ],
}
```

- **Movie categories (16):** Kung Fu Panda, Despicable Me, Nacho Libre, Up,
  Sing, Mulan, Coco, Moana, Ratatouille, Wall-E, Cars, Incredibles, Big Hero 6,
  Ice Age, Home Alone, Spider-Man (Tom Holland trilogy).
- **Other categories:** Flags, US Cities, Animals, Minecraft, Calvin & Hobbes.
- **Deferred:** Name That Tune (see audio slot below).
- Each category ships **5+ questions**; ~120 questions total, authored as part of
  this work.
- Each board build **shuffles** a category's questions and assigns 5 to the
  value tiles. **Point value is the reward only, not difficulty** — keeps
  authoring simple (flat pool per category).

### Audio slot (designed now, built in phase 2)
A question may carry an optional `audio: { provider, id, start }`. The reveal
step checks for it: if present, the TV plays audio instead of typing text; if
absent (all phase-1 packs), it types text as normal. Phase-2 "Name That Tune"
drops a hidden YouTube IFrame player into the TV reveal step **without touching
the game's buzz/score logic**.

## Files

| File | Change |
| --- | --- |
| `server/games/jeopardy/index.js` | New game module: `id/name/emoji/blurb/minPlayers/maxPlayers`, `init`, `onAction`, `sync`. Holds board build + buzz/score state machine. |
| `server/games/jeopardy/packs.js` | New — the category question banks. |
| `server/games/index.js` | Register the new game. |
| `public/js/tv.js` | Add `case 'jeopardy'` + `renderJeopardy(payload)`: setup screen, board grid, reveal text, buzz banner, answer reveal, winner screen. Small buzz sound. |
| `public/js/controller.js` | **One new view type: `buzz`** (a big buzz button). Plus a tweak so that when multiple local seats are simultaneously showing a `buzz` view, they render stacked at once (split buzz) instead of one-at-a-time. Answering reuses `choices`/`prompt`/`text`/`flash: 'wrong'`. |

`minPlayers: 1, maxPlayers: 8`.

## State machine (server `state.phase`)

- `setup` — choosing categories on the TV.
- `board` — picker selecting a tile.
- `reveal` — question typing out; phones can buzz.
- `answer` — someone buzzed; they pick a choice (8s clock).
- `resolved` — answer shown briefly before returning to `board`.
- `over` — board empty; winner shown.

Server-side timers (reveal tick, answer clock, resolved pause) are stored on
`state` and cleared on transitions / game teardown so a reconnect mid-question
re-syncs cleanly via `sync(ctx)`.

## Testing

Pure helpers are unit-tested (no socket plumbing):
- **Board build** — N categories → grid with 5 tiles each at the right values;
  questions shuffled and not repeated within a column.
- **Buzz resolution** — two near-simultaneous buzzes → only the first locks in;
  a locked-out player's buzz is ignored on re-open. Buzzes from two seats on one
  device attribute to the correct seat.
- **Score math** — correct adds value, wrong subtracts value but never below 0,
  picker reassigned on correct only.
- **Board-empty detection** → transition to `over`, winner = max score.

Manual living-room pass for pacing/feel (reveal speed, answer clock length).

## Decisions locked

- Reveal style: question types out word-by-word; choices always visible.
- Buzz: classic lockout, wrong = −value + re-open.
- Structure: Jeopardy board, picker = last correct answerer.
- Content: built-in JSON packs; each movie is its own category.
- Answer clock: 10s. Point value = reward, not difficulty. Scores floor at 0.
- Name That Tune deferred to phase 2; audio slot designed into the data model.
- Shared device: split buzz, one button per seat (tuned for 2), so two people
  can race on one phone.
