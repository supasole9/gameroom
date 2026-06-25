# 🎮 Family Arcade

A cast-to-TV party game system for the whole family (ages 4–12). The **TV is the
shared screen**, and **everyone's phone is a controller** — just like Jackbox.
No app installs: phones join by opening a link and typing a 4-letter room code.

Built so you can keep adding games to the arcade. Three are included:

| Game | Emoji | What you do |
| --- | --- | --- |
| **Snakes & Ladders** | 🐍 | Tap to roll the dice, climb ladders, dodge snakes. First to 100 wins. The TV narrates every roll. |
| **Story Builder** | 📖 | Take turns adding silly words to a mad-lib. When it's done, the TV **reads the whole story aloud**. |
| **Draw & Guess** | 🎨 | One player draws a secret word on their phone — it appears live on the TV — everyone else taps to guess. |
| **Math Tug of War** | 🪢 | 2-player duel: answer math questions fast to pull the rope your way. Each player picks their own difficulty, so mixed ages compete fairly. |

## Run it

```bash
npm install
npm start
```

The terminal prints two URLs:

- 📺 **On the TV / computer:** open `http://<your-ip>:5858/tv.html` (cast this browser tab to the TV).
- 📱 **On each phone:** either **scan the QR code** shown on the TV, or open `http://<your-ip>:5858/` and type the 4-letter room code.

Everyone must be on the **same Wi-Fi**. Then pick a game on the TV and play!

### Built for real living rooms

- **Scan-to-join QR** on the TV — no typing IP addresses.
- **Reconnection:** if a kid's phone locks or drops Wi-Fi, it silently rejoins
  with the **same avatar and score** (each phone keeps a stable id in
  `localStorage`). A "Reconnecting…" banner shows while it's offline.
- **Host controls:** offline players are greyed out on the TV; hover a player
  to remove a stale slot.

> Tip: the TV uses the browser's built-in speech to narrate. If you hear nothing,
> click a game card once (browsers require a click before they'll play audio).

## How it's built

- **`server/`** — Node + Express + Socket.IO.
  - `rooms.js` — room codes, players, avatars.
  - `context.js` — the small API a game uses to talk to the TV and phones
    (`renderTV`, `view`, `narrate`, `addScore`…).
  - `games/` — one file per game. **Add a game by dropping a module here and
    registering it in `games/index.js`.**
- **`public/`** — the two screens.
  - `tv.html` / `js/tv.js` — the shared TV display (lobby, scoreboards, per-game renderers).
  - `index.html` / `js/controller.js` — the phone controller. It renders a small
    **declarative view protocol** (`button`, `choices`, `input`, `draw`, `text`)
    that games send, so most new games need *zero* new controller code.

### Adding a new game

1. Create `server/games/mygame.js` exporting `{ id, name, emoji, blurb, minPlayers, maxPlayers, init(ctx), onAction(ctx, player, action) }`.
2. Register it in `server/games/index.js`.
3. (Optional) Add a `renderMygame(payload)` branch in `public/js/tv.js` for custom TV visuals — or reuse the existing patterns.

The controller UI usually needs no changes thanks to the declarative view protocol.
