# Jeopardy "Buzz Room" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Jackbox-style Jeopardy trivia game to the Family Arcade — the TV shows a category board and types out questions; every phone is a buzzer; first to buzz locks everyone out and answers multiple choice.

**Architecture:** One game module under `server/games/jeopardy/` split into pure logic (`logic.js`, unit-tested), question data (`packs.js`), and the socket-wired state machine (`index.js`). The TV gets a `renderJeopardy` branch; the controller gets one new `buzz` view type plus a split-buzz path so two people on one phone can race. A small generic `host:gameAction` channel lets the TV drive category setup.

**Tech Stack:** Node 18+ (ESM), Express, Socket.IO, vanilla browser JS. Tests use the built-in `node --test` runner (no new dependencies).

## Global Constraints

- **ESM only** — `"type": "module"`; use `import`/`export`, no `require`.
- **No new npm dependencies** — tests use `node --test` / `node:assert`.
- **Node `>=18`** (per `package.json` engines).
- **Game module interface** (from `server/games/*.js`): export default `{ id, name, emoji, blurb, minPlayers, maxPlayers, init(ctx), onAction(ctx, player, action), sync(ctx) }`. New optional hook this plan adds: `onHostAction(ctx, action)`.
- **Context API** (`server/context.js`): `ctx.players` (connected, public-safe), `ctx.state` (get/set `room.state`), `ctx.room`, `ctx.renderTV(extra)`, `ctx.narrate(text)`, `ctx.view(pid, viewObj)`, `ctx.renderControllers(fn)`, `ctx.addScore(pid, points)`, `ctx.tvEvent(event, payload)`.
- **Controller view protocol** (`public/js/controller.js`): control types `button`, `text`, `prompt`, `choices`, `input`, `draw`, `timing`, `flick`, `reaction`, `challenge`, `upload`. A view is `{ title, subtitle, controls:[...], flash:'wrong'? }`. `choices` option = `{ id, label, emoji?, img?, disabled? }`; a tap emits `player:action {pid, control:<choices.id>, value:<opt.id>}`.
- **Scoring rules:** correct = +tile value; wrong/timeout = −tile value but **floored at 0**; answer clock **10 seconds**; point value is reward only, not difficulty.
- **Categories per board:** 2–4. Tile values `[100,200,300,400,500]`.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `server/games/jeopardy/packs.js` | **Create.** Category catalogue + question banks + `categoryList()` / `getCategory(id)`. |
| `server/games/jeopardy/logic.js` | **Create.** Pure helpers: `shuffle`, `buildBoard`, `findTile`, `boardEmpty`, `canBuzz`, `applyScore`, `computeWinner`, `revealMsFor`, `tileId`/`parseTileId`. No sockets. |
| `server/games/jeopardy/logic.test.js` | **Create.** `node --test` unit tests for `logic.js`. |
| `server/games/jeopardy/index.js` | **Create.** Game module: state machine, timers, `init`/`onAction`/`onHostAction`/`sync`, controller + TV rendering calls. |
| `server/games/jeopardy/game.test.js` | **Create.** `node --test` tests for the state machine using a fake `ctx`. |
| `server/games/index.js` | **Modify.** Register `jeopardy`. |
| `server/index.js` | **Modify.** Add `host:gameAction` socket event → `room.game.onHostAction`. |
| `public/js/controller.js` | **Modify.** Add `buzz` control type + split-buzz render path. |
| `public/js/tv.js` | **Modify.** Add `case 'jeopardy'` + `renderJeopardy(payload)` + buzz sound + picker highlight. |
| `public/css/style.css` | **Modify.** Append Jeopardy styles. |
| `package.json` | **Modify.** Add `"test": "node --test"` script. |
| `README.md` | **Modify.** Add the game to the table + adding-a-game note about `onHostAction`. |

---

## Task 1: Question packs

**Files:**
- Create: `server/games/jeopardy/packs.js`
- Test: covered by `logic.test.js` (Task 2) via a structural-validity test that imports the catalogue.

**Interfaces:**
- Produces: `categoryList()` → `[{ id, name, emoji }]`; `getCategory(id)` → `{ id, name, emoji, questions:[{ q, choices:[s,s,s,s], answer:int, audio? }] }` or `undefined`; `CATEGORIES` (array of full category objects).
- A question: `{ q: string, choices: [string,string,string,string], answer: 0..3, audio?: { provider, id, start } }`. `audio` is omitted in all phase-1 packs (the field exists only so phase-2 Name That Tune can be added without schema changes).

- [ ] **Step 1: Write the packs file**

Create `server/games/jeopardy/packs.js`. Every category MUST have at least 5 questions; each question MUST have exactly 4 choices and an `answer` index in 0–3. Keep questions at a "kid who has seen the movie / knows the topic" level.

```js
// Question banks for the Jeopardy "Buzz Room" game.
// Each category is one board column. answer = index into choices (0-3).
// Optional per-question `audio:{provider,id,start}` is reserved for a future
// "Name That Tune" mode; phase-1 packs never set it.

export const CATEGORIES = [
  // ---------- Movies ----------
  { id: 'kungfupanda', name: 'Kung Fu Panda', emoji: '🐼', questions: [
    { q: 'What animal is the hero Po?', choices: ['Panda', 'Tiger', 'Monkey', 'Crane'], answer: 0 },
    { q: 'Po is chosen to be the…', choices: ['Dragon Warrior', 'Mayor', 'Cook', 'Teacher'], answer: 0 },
    { q: 'Who is the little red panda master?', choices: ['Shifu', 'Oogway', 'Tai Lung', 'Mr. Ping'], answer: 0 },
    { q: 'What food does Po\'s family make?', choices: ['Noodles', 'Tacos', 'Pizza', 'Sushi'], answer: 0 },
    { q: 'The wise old turtle is named…', choices: ['Oogway', 'Shifu', 'Po', 'Tigress'], answer: 0 },
    { q: 'The snow leopard villain is…', choices: ['Tai Lung', 'Lord Shen', 'Kai', 'Crane'], answer: 0 },
  ]},
  { id: 'despicableme', name: 'Despicable Me', emoji: '🌙', questions: [
    { q: 'What are Gru\'s little yellow helpers called?', choices: ['Minions', 'Goblins', 'Elves', 'Bots'], answer: 0 },
    { q: 'What does Gru try to steal in the first movie?', choices: ['The Moon', 'The Sun', 'A bank', 'A castle'], answer: 0 },
    { q: 'How many girls does Gru adopt?', choices: ['Three', 'One', 'Two', 'Four'], answer: 0 },
    { q: 'The youngest girl who loves unicorns is…', choices: ['Agnes', 'Margo', 'Edith', 'Lucy'], answer: 0 },
    { q: 'Minions love this yellow fruit:', choices: ['Banana', 'Lemon', 'Mango', 'Corn'], answer: 0 },
    { q: 'What does Agnes shout about the unicorn? "It\'s so…"', choices: ['Fluffy!', 'Big!', 'Fast!', 'Loud!'], answer: 0 },
  ]},
  { id: 'nacholibre', name: 'Nacho Libre', emoji: '🤼', questions: [
    { q: 'What sport does Nacho secretly do?', choices: ['Wrestling', 'Soccer', 'Boxing', 'Racing'], answer: 0 },
    { q: 'What is Nacho\'s day job?', choices: ['Cook', 'Teacher', 'Driver', 'Farmer'], answer: 0 },
    { q: 'Nacho lives and works at a…', choices: ['Monastery', 'School', 'Farm', 'Hotel'], answer: 0 },
    { q: 'Mexican wrestling is called…', choices: ['Lucha libre', 'Judo', 'Sumo', 'Karate'], answer: 0 },
    { q: 'Nacho\'s skinny tag-team partner is named…', choices: ['Esqueleto', 'Ramses', 'Chancho', 'Steven'], answer: 0 },
  ]},
  { id: 'up', name: 'Up', emoji: '🎈', questions: [
    { q: 'How does Carl make his house fly?', choices: ['Balloons', 'A rocket', 'Wings', 'A fan'], answer: 0 },
    { q: 'What is the name of the boy scout?', choices: ['Russell', 'Carl', 'Dug', 'Kevin'], answer: 0 },
    { q: 'The talking dog is named…', choices: ['Dug', 'Kevin', 'Alpha', 'Rex'], answer: 0 },
    { q: 'Kevin in the movie is actually a…', choices: ['Bird', 'Dog', 'Cat', 'Bear'], answer: 0 },
    { q: 'Where does Carl want to take his house?', choices: ['Paradise Falls', 'The beach', 'The moon', 'New York'], answer: 0 },
  ]},
  { id: 'sing', name: 'Sing', emoji: '🎤', questions: [
    { q: 'What kind of animal is Buster Moon?', choices: ['Koala', 'Pig', 'Mouse', 'Gorilla'], answer: 0 },
    { q: 'Buster Moon runs a…', choices: ['Theater', 'Bakery', 'School', 'Zoo'], answer: 0 },
    { q: 'What does Buster hold to save his theater?', choices: ['A singing contest', 'A race', 'A bake sale', 'A dance'], answer: 0 },
    { q: 'The shy elephant who can really sing is…', choices: ['Meena', 'Rosita', 'Ash', 'Johnny'], answer: 0 },
    { q: 'Rosita the singer is a…', choices: ['Pig', 'Koala', 'Mouse', 'Porcupine'], answer: 0 },
  ]},
  { id: 'mulan', name: 'Mulan', emoji: '🗡️', questions: [
    { q: 'Why does Mulan join the army?', choices: ['To save her father', 'For money', 'For fun', 'To travel'], answer: 0 },
    { q: 'Mulan\'s little dragon sidekick is named…', choices: ['Mushu', 'Cri-Kee', 'Khan', 'Shan'], answer: 0 },
    { q: 'What lucky bug travels with Mulan?', choices: ['A cricket', 'A bee', 'A ladybug', 'A moth'], answer: 0 },
    { q: 'Mulan pretends to be a…', choices: ['Male soldier', 'Cook', 'Doctor', 'Prince'], answer: 0 },
    { q: 'Mulan\'s horse is named…', choices: ['Khan', 'Mushu', 'Shan', 'Po'], answer: 0 },
  ]},
  { id: 'coco', name: 'Coco', emoji: '💀', questions: [
    { q: 'What does Miguel want to become?', choices: ['A musician', 'A chef', 'A racer', 'A painter'], answer: 0 },
    { q: 'What holiday is the movie about?', choices: ['Day of the Dead', 'Christmas', 'Easter', 'Halloween'], answer: 0 },
    { q: 'What instrument does Miguel play?', choices: ['Guitar', 'Drums', 'Piano', 'Flute'], answer: 0 },
    { q: 'Miguel\'s family business is making…', choices: ['Shoes', 'Bread', 'Hats', 'Toys'], answer: 0 },
    { q: 'The friendly spirit dog is named…', choices: ['Dante', 'Pepita', 'Hector', 'Ernesto'], answer: 0 },
  ]},
  { id: 'moana', name: 'Moana', emoji: '🌊', questions: [
    { q: 'What does Moana sail across?', choices: ['The ocean', 'A desert', 'A jungle', 'The sky'], answer: 0 },
    { q: 'The demigod who joins Moana is…', choices: ['Maui', 'Tamatoa', 'Pua', 'Chief Tui'], answer: 0 },
    { q: 'What is Maui\'s magic fish hook used for?', choices: ['Shapeshifting', 'Cooking', 'Fishing only', 'Digging'], answer: 0 },
    { q: 'Moana\'s pet rooster is named…', choices: ['Heihei', 'Pua', 'Maui', 'Tala'], answer: 0 },
    { q: 'Moana sets out to return the heart of…', choices: ['Te Fiti', 'Te Ka', 'Maui', 'Motunui'], answer: 0 },
  ]},
  { id: 'ratatouille', name: 'Ratatouille', emoji: '🐀', questions: [
    { q: 'What animal is the chef Remy?', choices: ['Rat', 'Mouse', 'Cat', 'Dog'], answer: 0 },
    { q: 'What does Remy love to do?', choices: ['Cook', 'Sing', 'Dance', 'Paint'], answer: 0 },
    { q: 'In which city is the movie set?', choices: ['Paris', 'London', 'Rome', 'Tokyo'], answer: 0 },
    { q: 'Remy helps a young man named…', choices: ['Linguini', 'Gusteau', 'Ego', 'Skinner'], answer: 0 },
    { q: 'Remy hides under whose hat to steer him?', choices: ['Linguini', 'Ego', 'Skinner', 'Emile'], answer: 0 },
  ]},
  { id: 'walle', name: 'Wall-E', emoji: '🤖', questions: [
    { q: 'What is WALL-E\'s job?', choices: ['Cleaning up trash', 'Driving cars', 'Cooking', 'Flying'], answer: 0 },
    { q: 'The sleek white robot WALL-E loves is…', choices: ['EVE', 'AUTO', 'MO', 'GO-4'], answer: 0 },
    { q: 'What plant does WALL-E find?', choices: ['A seedling', 'A rose', 'A cactus', 'A tree'], answer: 0 },
    { q: 'Where do the humans live in the movie?', choices: ['On a spaceship', 'Underground', 'On the moon', 'In a city'], answer: 0 },
    { q: 'WALL-E keeps a small pet…', choices: ['Cockroach', 'Cat', 'Bird', 'Fish'], answer: 0 },
  ]},
  { id: 'cars', name: 'Cars', emoji: '🏎️', questions: [
    { q: 'What is Lightning McQueen?', choices: ['A race car', 'A truck', 'A plane', 'A bus'], answer: 0 },
    { q: 'Lightning\'s rusty tow-truck best friend is…', choices: ['Mater', 'Sally', 'Doc', 'Sarge'], answer: 0 },
    { q: 'What small town does Lightning get stuck in?', choices: ['Radiator Springs', 'Carburetor County', 'Tokyo', 'London'], answer: 0 },
    { q: 'What big race does Lightning want to win?', choices: ['Piston Cup', 'Gold Cup', 'World Cup', 'Speed Cup'], answer: 0 },
    { q: 'What color is Lightning McQueen?', choices: ['Red', 'Blue', 'Green', 'Yellow'], answer: 0 },
  ]},
  { id: 'incredibles', name: 'The Incredibles', emoji: '🦸', questions: [
    { q: 'The Incredibles are a family of…', choices: ['Superheroes', 'Spies', 'Pirates', 'Chefs'], answer: 0 },
    { q: 'What is the super-fast son named?', choices: ['Dash', 'Jack-Jack', 'Bob', 'Buddy'], answer: 0 },
    { q: 'Violet\'s power is turning…', choices: ['Invisible', 'Big', 'Fast', 'Fire'], answer: 0 },
    { q: 'The super-stretchy mom is…', choices: ['Elastigirl', 'Frozone', 'Edna', 'Mirage'], answer: 0 },
    { q: 'The baby with many powers is…', choices: ['Jack-Jack', 'Dash', 'Buddy', 'Tony'], answer: 0 },
  ]},
  { id: 'bighero6', name: 'Big Hero 6', emoji: '🎈', questions: [
    { q: 'What is Baymax?', choices: ['A robot', 'A dog', 'A car', 'A dragon'], answer: 0 },
    { q: 'What was Baymax built to be?', choices: ['A healthcare helper', 'A racer', 'A cook', 'A guard'], answer: 0 },
    { q: 'The boy who builds robots is named…', choices: ['Hiro', 'Tadashi', 'Fred', 'Wasabi'], answer: 0 },
    { q: 'What city is the movie set in?', choices: ['San Fransokyo', 'Gotham', 'Metropolis', 'Tokyo'], answer: 0 },
    { q: 'Hiro\'s tiny robots that swarm are called…', choices: ['Microbots', 'Nanos', 'Minibots', 'Drones'], answer: 0 },
  ]},
  { id: 'iceage', name: 'Ice Age', emoji: '🦣', questions: [
    { q: 'What kind of animal is Manny?', choices: ['Mammoth', 'Sloth', 'Tiger', 'Squirrel'], answer: 0 },
    { q: 'The squirrel always chasing an acorn is…', choices: ['Scrat', 'Sid', 'Diego', 'Manny'], answer: 0 },
    { q: 'Sid is a talkative…', choices: ['Sloth', 'Mammoth', 'Tiger', 'Possum'], answer: 0 },
    { q: 'Diego is a saber-toothed…', choices: ['Tiger', 'Bear', 'Wolf', 'Lion'], answer: 0 },
    { q: 'What is Scrat always chasing?', choices: ['An acorn', 'A fish', 'A bird', 'A leaf'], answer: 0 },
  ]},
  { id: 'homealone', name: 'Home Alone', emoji: '🏠', questions: [
    { q: 'What is the boy left home alone named?', choices: ['Kevin', 'Marv', 'Harry', 'Buzz'], answer: 0 },
    { q: 'What happens to Kevin\'s family?', choices: ['They fly away without him', 'They move', 'They hide', 'They sleep'], answer: 0 },
    { q: 'The two burglars are called the…', choices: ['Wet Bandits', 'Sticky Gang', 'Cat Burglars', 'Night Crew'], answer: 0 },
    { q: 'Kevin protects the house using…', choices: ['Booby traps', 'A dog', 'The police', 'A fence'], answer: 0 },
    { q: 'What holiday is the movie set during?', choices: ['Christmas', 'Halloween', 'Easter', 'Summer'], answer: 0 },
  ]},
  { id: 'spiderman', name: 'Spider-Man', emoji: '🕷️', questions: [
    { q: 'What is Spider-Man\'s real first name?', choices: ['Peter', 'Tony', 'Bruce', 'Miles'], answer: 0 },
    { q: 'How did Peter get his powers?', choices: ['A spider bite', 'A potion', 'Lightning', 'A suit'], answer: 0 },
    { q: 'Spider-Man shoots…', choices: ['Webs', 'Fire', 'Lasers', 'Ice'], answer: 0 },
    { q: 'Who mentors Peter in these movies?', choices: ['Iron Man', 'Captain America', 'Thor', 'Hulk'], answer: 0 },
    { q: 'Peter\'s wise guardian is…', choices: ['Aunt May', 'Uncle Ben', 'Happy', 'Ned'], answer: 0 },
    { q: 'Peter\'s best friend is named…', choices: ['Ned', 'Flash', 'Harry', 'MJ'], answer: 0 },
  ]},
  // ---------- General topics ----------
  { id: 'flags', name: 'Flags', emoji: '🚩', questions: [
    { q: 'Which country\'s flag has a red maple leaf?', choices: ['Canada', 'USA', 'Mexico', 'Brazil'], answer: 0 },
    { q: 'How many stars are on the USA flag?', choices: ['50', '13', '52', '48'], answer: 0 },
    { q: 'Which country\'s flag has a big red circle on a white background?', choices: ['Japan', 'China', 'Korea', 'Vietnam'], answer: 0 },
    { q: 'The flag with red, white, and blue stripes and a maple leaf is…', choices: ['Canada', 'France', 'UK', 'USA'], answer: 0 },
    { q: 'Which country\'s flag is green, white, and red with an eagle and snake?', choices: ['Mexico', 'Italy', 'Spain', 'Peru'], answer: 0 },
    { q: 'The flag that is solid green is from…', choices: ['Libya (historic)', 'Brazil', 'India', 'Egypt'], answer: 0 },
  ]},
  { id: 'uscities', name: 'US Cities', emoji: '🏙️', questions: [
    { q: 'Which city is called the Big Apple?', choices: ['New York', 'Chicago', 'Boston', 'Miami'], answer: 0 },
    { q: 'The Golden Gate Bridge is in…', choices: ['San Francisco', 'Los Angeles', 'Seattle', 'San Diego'], answer: 0 },
    { q: 'Which city is famous for jazz and gumbo?', choices: ['New Orleans', 'Nashville', 'Austin', 'Memphis'], answer: 0 },
    { q: 'The Space Needle is in…', choices: ['Seattle', 'Portland', 'Denver', 'Chicago'], answer: 0 },
    { q: 'Which city is the US capital?', choices: ['Washington, D.C.', 'New York', 'Philadelphia', 'Boston'], answer: 0 },
    { q: 'Hollywood is part of which city?', choices: ['Los Angeles', 'Las Vegas', 'Phoenix', 'Dallas'], answer: 0 },
  ]},
  { id: 'animals', name: 'Animals', emoji: '🐾', questions: [
    { q: 'Which animal is the tallest?', choices: ['Giraffe', 'Elephant', 'Horse', 'Bear'], answer: 0 },
    { q: 'Which animal is known as the king of the jungle?', choices: ['Lion', 'Tiger', 'Gorilla', 'Wolf'], answer: 0 },
    { q: 'How many legs does a spider have?', choices: ['8', '6', '10', '4'], answer: 0 },
    { q: 'Which animal can change color to hide?', choices: ['Chameleon', 'Frog', 'Snake', 'Turtle'], answer: 0 },
    { q: 'What is a baby dog called?', choices: ['Puppy', 'Kitten', 'Cub', 'Foal'], answer: 0 },
    { q: 'Which is the largest animal on Earth?', choices: ['Blue whale', 'Elephant', 'Shark', 'Giraffe'], answer: 0 },
  ]},
  { id: 'minecraft', name: 'Minecraft', emoji: '⛏️', questions: [
    { q: 'What green creature explodes near you?', choices: ['Creeper', 'Zombie', 'Skeleton', 'Slime'], answer: 0 },
    { q: 'What do you mine to make a diamond pickaxe?', choices: ['Diamonds', 'Gold', 'Iron', 'Coal'], answer: 0 },
    { q: 'What animal gives you wool?', choices: ['Sheep', 'Cow', 'Pig', 'Chicken'], answer: 0 },
    { q: 'The tall black creature that teleports is the…', choices: ['Enderman', 'Creeper', 'Zombie', 'Ghast'], answer: 0 },
    { q: 'What block lights up and is made from sand?', choices: ['Glass', 'Stone', 'Dirt', 'Wood'], answer: 0 },
    { q: 'The boss in the End is the Ender…', choices: ['Dragon', 'Man', 'Wolf', 'King'], answer: 0 },
  ]},
  { id: 'calvinhobbes', name: 'Calvin & Hobbes', emoji: '🐯', questions: [
    { q: 'What kind of animal is Hobbes?', choices: ['Tiger', 'Lion', 'Bear', 'Cat'], answer: 0 },
    { q: 'To everyone but Calvin, Hobbes looks like a…', choices: ['Stuffed toy', 'Real tiger', 'Dog', 'Pillow'], answer: 0 },
    { q: 'Calvin\'s flying-sled rides happen on a…', choices: ['Sled / wagon', 'Bike', 'Skateboard', 'Boat'], answer: 0 },
    { q: 'Calvin\'s imaginary superhero alter-ego is…', choices: ['Spaceman Spiff', 'Super Calvin', 'Captain Tiger', 'Mega Boy'], answer: 0 },
    { q: 'Calvin\'s club with Hobbes is called…', choices: ['G.R.O.S.S.', 'The Tigers', 'Boys Only', 'The Club'], answer: 0 },
  ]},
];

export function categoryList() {
  return CATEGORIES.map((c) => ({ id: c.id, name: c.name, emoji: c.emoji }));
}

export function getCategory(id) {
  return CATEGORIES.find((c) => c.id === id);
}
```

- [ ] **Step 2: Sanity-check the file imports**

Run: `node -e "import('./server/games/jeopardy/packs.js').then(m=>console.log(m.CATEGORIES.length,'categories'))"`
Expected: `21 categories`

- [ ] **Step 3: Commit**

```bash
git add server/games/jeopardy/packs.js
git commit -m "feat(jeopardy): add question packs (21 categories)"
```

---

## Task 2: Pure logic + tests

**Files:**
- Create: `server/games/jeopardy/logic.js`
- Create: `server/games/jeopardy/logic.test.js`
- Modify: `package.json` (add test script)

**Interfaces:**
- Consumes: `getCategory(id)`, `CATEGORIES` from `./packs.js`.
- Produces:
  - `TILE_VALUES = [100,200,300,400,500]`
  - `shuffle(arr, rng=Math.random)` → new shuffled array
  - `buildBoard(categories, rng=Math.random)` → `{ columns:[{ id,name,emoji, tiles:[{ value, q, choices, answer, audio, done:false }] }] }`
  - `tileId(colId, value)` → `"colId:value"`; `parseTileId(str)` → `{ colId, value }`
  - `findTile(board, colId, value)` → tile or null
  - `boardEmpty(board)` → bool
  - `canBuzz(state, pid)` → bool (true when `state.buzzedBy == null` and `pid` not in `state.lockedOut`)
  - `applyScore(current, delta)` → `Math.max(0, current+delta)`
  - `computeWinner(players)` → pid of max `score` (first on tie), or null
  - `revealMsFor(text)` → ms to type the text at ~3 words/sec, min 1200

- [ ] **Step 1: Add the test script to package.json**

Modify `package.json` `"scripts"` to add a test entry:

```json
  "scripts": {
    "start": "node server/index.js",
    "dev": "node --watch server/index.js",
    "test": "node --test"
  },
```

- [ ] **Step 2: Write the failing tests**

Create `server/games/jeopardy/logic.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TILE_VALUES, shuffle, buildBoard, tileId, parseTileId, findTile,
  boardEmpty, canBuzz, applyScore, computeWinner, revealMsFor,
} from './logic.js';
import { CATEGORIES, getCategory } from './packs.js';

// A deterministic rng for repeatable shuffles in tests.
function seededRng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}

test('every category is well-formed (>=5 Qs, 4 choices, valid answer)', () => {
  assert.ok(CATEGORIES.length >= 2);
  for (const c of CATEGORIES) {
    assert.ok(c.id && c.name && c.emoji, `meta for ${c.id}`);
    assert.ok(c.questions.length >= 5, `${c.id} needs >=5 questions`);
    for (const q of c.questions) {
      assert.equal(q.choices.length, 4, `${c.id}: "${q.q}" needs 4 choices`);
      assert.ok(Number.isInteger(q.answer) && q.answer >= 0 && q.answer <= 3, `${c.id}: bad answer index`);
    }
  }
});

test('shuffle is a permutation and is deterministic with a seeded rng', () => {
  const input = [1, 2, 3, 4, 5, 6];
  const out = shuffle(input, seededRng(42));
  assert.deepEqual([...out].sort((a, b) => a - b), input);
  assert.deepEqual(out, shuffle(input, seededRng(42)));
  assert.deepEqual(input, [1, 2, 3, 4, 5, 6]); // input not mutated
});

test('buildBoard makes one column per category with 5 valued tiles', () => {
  const cats = [getCategory('cars'), getCategory('animals')];
  const board = buildBoard(cats, seededRng(7));
  assert.equal(board.columns.length, 2);
  for (const col of board.columns) {
    assert.equal(col.tiles.length, 5);
    assert.deepEqual(col.tiles.map((t) => t.value), TILE_VALUES);
    assert.ok(col.tiles.every((t) => t.done === false));
    assert.ok(col.tiles.every((t) => t.choices.length === 4));
    // questions within a column are distinct
    const qs = col.tiles.map((t) => t.q);
    assert.equal(new Set(qs).size, qs.length);
  }
});

test('tileId / parseTileId round-trip', () => {
  assert.equal(tileId('cars', 300), 'cars:300');
  assert.deepEqual(parseTileId('cars:300'), { colId: 'cars', value: 300 });
});

test('findTile + boardEmpty', () => {
  const board = buildBoard([getCategory('cars')], seededRng(1));
  const t = findTile(board, 'cars', 200);
  assert.ok(t && t.value === 200);
  assert.equal(findTile(board, 'nope', 200), null);
  assert.equal(boardEmpty(board), false);
  board.columns[0].tiles.forEach((tile) => { tile.done = true; });
  assert.equal(boardEmpty(board), true);
});

test('canBuzz respects first-buzz and lockout', () => {
  assert.equal(canBuzz({ buzzedBy: null, lockedOut: [] }, 'a'), true);
  assert.equal(canBuzz({ buzzedBy: 'b', lockedOut: [] }, 'a'), false); // someone already buzzed
  assert.equal(canBuzz({ buzzedBy: null, lockedOut: ['a'] }, 'a'), false); // locked out
});

test('applyScore floors at 0', () => {
  assert.equal(applyScore(300, 200), 500);
  assert.equal(applyScore(100, -300), 0);
  assert.equal(applyScore(0, -100), 0);
});

test('computeWinner returns highest score, first on tie', () => {
  assert.equal(computeWinner([{ id: 'a', score: 3 }, { id: 'b', score: 7 }]), 'b');
  assert.equal(computeWinner([{ id: 'a', score: 5 }, { id: 'b', score: 5 }]), 'a');
  assert.equal(computeWinner([]), null);
});

test('revealMsFor scales with word count and has a floor', () => {
  assert.ok(revealMsFor('one two three') >= 1200);
  assert.ok(revealMsFor('a b c d e f g h i j k l') > revealMsFor('a b c'));
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module './logic.js'` / export errors.

- [ ] **Step 4: Write the implementation**

Create `server/games/jeopardy/logic.js`:

```js
// Pure, socket-free helpers for the Jeopardy game. Everything here is unit-tested.

export const TILE_VALUES = [100, 200, 300, 400, 500];

export function shuffle(arr, rng = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// categories: [{ id, name, emoji, questions:[{q,choices,answer,audio?}] }]
export function buildBoard(categories, rng = Math.random) {
  return {
    columns: categories.map((cat) => {
      const picked = shuffle(cat.questions, rng).slice(0, TILE_VALUES.length);
      return {
        id: cat.id,
        name: cat.name,
        emoji: cat.emoji,
        tiles: TILE_VALUES.map((value, i) => {
          const q = picked[i];
          return {
            value,
            q: q.q,
            choices: q.choices,
            answer: q.answer,
            audio: q.audio || null,
            done: false,
          };
        }),
      };
    }),
  };
}

export function tileId(colId, value) {
  return `${colId}:${value}`;
}

export function parseTileId(str) {
  const [colId, value] = String(str).split(':');
  return { colId, value: Number(value) };
}

export function findTile(board, colId, value) {
  const col = board.columns.find((c) => c.id === colId);
  if (!col) return null;
  return col.tiles.find((t) => t.value === value) || null;
}

export function boardEmpty(board) {
  return board.columns.every((c) => c.tiles.every((t) => t.done));
}

export function canBuzz(state, pid) {
  return state.buzzedBy == null && !(state.lockedOut || []).includes(pid);
}

export function applyScore(current, delta) {
  return Math.max(0, (current || 0) + delta);
}

export function computeWinner(players) {
  let best = null;
  for (const p of players) if (!best || p.score > best.score) best = p;
  return best ? best.id : null;
}

export function revealMsFor(text) {
  const words = String(text).trim().split(/\s+/).length;
  return Math.max(1200, Math.round((words / 3) * 1000));
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — all `logic.test.js` tests green.

- [ ] **Step 6: Commit**

```bash
git add server/games/jeopardy/logic.js server/games/jeopardy/logic.test.js package.json
git commit -m "feat(jeopardy): pure board/scoring/buzz logic with tests"
```

---

## Task 3: Server host-action channel

**Files:**
- Modify: `server/index.js` (add a socket handler near `host:selectGame`, ~line 159)

**Interfaces:**
- Produces: a new socket event `host:gameAction` that the TV emits as `{ control, value }`. The server validates the sender is the host of a running game and calls `room.game.onHostAction(ctx, action)` if that hook exists. Games without the hook ignore host actions.

- [ ] **Step 1: Add the handler**

In `server/index.js`, immediately after the `socket.on('host:arcade', …)` block (ends ~line 171), add:

```js
  // The TV drives a running game (e.g. Jeopardy category setup, host controls).
  socket.on('host:gameAction', (action) => {
    const room = findRoomBySocket(socket.id);
    if (!room || room.hostSocketId !== socket.id) return;
    if (room.phase !== 'game' || !room.game) return;
    if (typeof room.game.onHostAction !== 'function') return;
    const ctx = createContext(io, room);
    room.game.onHostAction(ctx, action || {});
  });
```

- [ ] **Step 2: Verify the server still boots**

Run: `node -e "import('./server/index.js')" & sleep 1; kill %1 2>/dev/null; echo ok`
Expected: prints the Family Arcade banner then `ok`, no errors. (If the port is busy, set `PORT=5999` before the command.)

- [ ] **Step 3: Commit**

```bash
git add server/index.js
git commit -m "feat: add host:gameAction channel for TV-driven game setup"
```

---

## Task 4: Game state machine + tests

**Files:**
- Create: `server/games/jeopardy/index.js`
- Create: `server/games/jeopardy/game.test.js`
- Modify: `server/games/index.js` (register)

**Interfaces:**
- Consumes: everything from `./logic.js` and `./packs.js`; the `ctx` API.
- Produces: default export game module with `id:'jeopardy'`. State shape on `ctx.state`:
  ```
  {
    phase: 'setup'|'board'|'reveal'|'answer'|'resolved'|'over',
    categoryIds: string[],            // chosen categories (for replay)
    board: <buildBoard result> | null,
    pickerId: string | null,          // whose turn to pick a tile
    current: { colId, value, q, choices, answer, audio } | null,
    revealMs: number,                 // how long the TV should type the question
    buzzedBy: string | null,          // pid that buzzed in
    lockedOut: string[],              // pids that already missed this tile
    lastResult: { pid, correct, value, answer } | null, // for the resolved screen
    winner: string | null,
  }
  ```
- The module also exports `_test` helpers? No — tests import the default and drive it with a fake ctx (below). Timers are real `setTimeout`s keyed by `room.code`; tests pass a ctx with a fake room code and call the action handlers directly (they don't wait on timers; timer-driven transitions are exercised by calling the exported transition functions through `onAction`). To keep transitions testable without waiting, the module checks `ctx.now`/timers only for the auto-advance pauses; **all scoring and lockout logic is synchronous inside `onAction`**, so tests assert immediately after each action.

- [ ] **Step 1: Write the failing tests**

Create `server/games/jeopardy/game.test.js`. The fake ctx records calls and lets us inspect state transitions synchronously.

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import game from './index.js';

// Minimal fake ctx. players is a fixed roster; state is a mutable holder.
function makeCtx(playerIds) {
  const players = playerIds.map((id) => ({ id, name: id.toUpperCase(), avatar: '🙂', score: 0, connected: true }));
  const scores = Object.fromEntries(players.map((p) => [p.id, 0]));
  const ctx = {
    room: { code: 'TEST', gameId: 'jeopardy' },
    players,
    _state: null,
    get state() { return this._state; },
    set state(s) { this._state = s; },
    tvCalls: [],
    viewCalls: [],
    narrations: [],
    renderTV(extra = {}) { this.tvCalls.push(extra); },
    renderControllers(fn) { for (const p of this.players) this.viewCalls.push({ pid: p.id, view: fn(p) }); },
    view(pid, v) { this.viewCalls.push({ pid, view: v }); },
    narrate(t) { this.narrations.push(t); },
    addScore(pid, pts) { const p = players.find((x) => x.id === pid); if (p) p.score += pts; scores[pid] += pts; },
    tvEvent() {},
  };
  return ctx;
}

function startGame(ctx, categoryIds) {
  game.init(ctx);
  game.onHostAction(ctx, { control: 'categories', value: categoryIds });
}

test('init enters setup; host categories build the board and set first picker', () => {
  const ctx = makeCtx(['a', 'b']);
  game.init(ctx);
  assert.equal(ctx.state.phase, 'setup');
  game.onHostAction(ctx, { control: 'categories', value: ['cars', 'animals'] });
  assert.equal(ctx.state.phase, 'board');
  assert.equal(ctx.state.board.columns.length, 2);
  assert.equal(ctx.state.pickerId, 'a'); // first connected player picks first
});

test('rejects fewer than 2 or more than 4 categories', () => {
  const ctx = makeCtx(['a', 'b']);
  game.init(ctx);
  game.onHostAction(ctx, { control: 'categories', value: ['cars'] });
  assert.equal(ctx.state.phase, 'setup'); // still in setup, not enough categories
});

test('picker selects a tile -> reveal phase, buzz open', () => {
  const ctx = makeCtx(['a', 'b']);
  startGame(ctx, ['cars', 'animals']);
  const colId = ctx.state.board.columns[0].id;
  game.onAction(ctx, ctx.players[0], { control: 'tile', value: `${colId}:300` });
  assert.equal(ctx.state.phase, 'reveal');
  assert.equal(ctx.state.current.value, 300);
  assert.equal(ctx.state.buzzedBy, null);
});

test('non-picker cannot select a tile', () => {
  const ctx = makeCtx(['a', 'b']);
  startGame(ctx, ['cars', 'animals']);
  const colId = ctx.state.board.columns[0].id;
  game.onAction(ctx, ctx.players[1], { control: 'tile', value: `${colId}:300` }); // b is not picker
  assert.equal(ctx.state.phase, 'board');
});

test('first buzz wins; a second buzz is ignored', () => {
  const ctx = makeCtx(['a', 'b']);
  startGame(ctx, ['cars', 'animals']);
  const colId = ctx.state.board.columns[0].id;
  game.onAction(ctx, ctx.players[0], { control: 'tile', value: `${colId}:100` });
  game.onAction(ctx, ctx.players[1], { control: 'buzz', value: true }); // b buzzes first
  assert.equal(ctx.state.buzzedBy, 'b');
  assert.equal(ctx.state.phase, 'answer');
  game.onAction(ctx, ctx.players[0], { control: 'buzz', value: true }); // a too late
  assert.equal(ctx.state.buzzedBy, 'b');
});

test('correct answer adds value, marks tile done, picker becomes answerer', () => {
  const ctx = makeCtx(['a', 'b']);
  startGame(ctx, ['cars', 'animals']);
  const col = ctx.state.board.columns[0];
  game.onAction(ctx, ctx.players[0], { control: 'tile', value: `${col.id}:200` });
  game.onAction(ctx, ctx.players[1], { control: 'buzz', value: true });
  const tile = ctx.state.current;
  game.onAction(ctx, ctx.players[1], { control: 'answer', value: tile.answer });
  assert.equal(ctx.players.find((p) => p.id === 'b').score, 200);
  assert.equal(ctx.state.pickerId, 'b');
  // tile is marked done on the board
  const onBoard = ctx.state.board.columns[0].tiles.find((t) => t.value === 200);
  assert.equal(onBoard.done, true);
});

test('wrong answer subtracts value (floored 0), locks out, reopens for others', () => {
  const ctx = makeCtx(['a', 'b']);
  startGame(ctx, ['cars', 'animals']);
  const col = ctx.state.board.columns[0];
  game.onAction(ctx, ctx.players[0], { control: 'tile', value: `${col.id}:100` });
  game.onAction(ctx, ctx.players[0], { control: 'buzz', value: true });
  const wrong = (ctx.state.current.answer + 1) % 4;
  game.onAction(ctx, ctx.players[0], { control: 'answer', value: wrong });
  assert.equal(ctx.players.find((p) => p.id === 'a').score, 0); // floored, not negative
  assert.ok(ctx.state.lockedOut.includes('a'));
  assert.equal(ctx.state.phase, 'reveal'); // reopened
  assert.equal(ctx.state.buzzedBy, null);
});

test('a locked-out player cannot buzz on reopen', () => {
  const ctx = makeCtx(['a', 'b']);
  startGame(ctx, ['cars', 'animals']);
  const col = ctx.state.board.columns[0];
  game.onAction(ctx, ctx.players[0], { control: 'tile', value: `${col.id}:100` });
  game.onAction(ctx, ctx.players[0], { control: 'buzz', value: true });
  game.onAction(ctx, ctx.players[0], { control: 'answer', value: (ctx.state.current.answer + 1) % 4 });
  game.onAction(ctx, ctx.players[0], { control: 'buzz', value: true }); // a is locked out
  assert.equal(ctx.state.buzzedBy, null);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test server/games/jeopardy/game.test.js`
Expected: FAIL — `Cannot find module './index.js'` / undefined export.

- [ ] **Step 3: Write the game module**

Create `server/games/jeopardy/index.js`:

```js
// Jeopardy "Buzz Room". The TV shows a category board and types out questions;
// phones are buzzers. First to buzz locks everyone out, then answers multiple
// choice. See docs/superpowers/specs/2026-06-29-jeopardy-buzz-room-design.md.
import {
  buildBoard, findTile, parseTileId, tileId, boardEmpty,
  canBuzz, applyScore, computeWinner, revealMsFor,
} from './logic.js';
import { categoryList, getCategory } from './packs.js';

const ANSWER_MS = 10000;   // answer clock after a buzz
const RESOLVED_MS = 3000;  // pause showing the result before the next pick
const REOPEN_GRACE_MS = 800;

// Real timers, keyed by room code so a game's pending transition can be cancelled.
const timers = new Map();
function setTimer(code, ms, fn) {
  clearTimer(code);
  timers.set(code, setTimeout(fn, ms));
}
function clearTimer(code) {
  const t = timers.get(code);
  if (t) { clearTimeout(t); timers.delete(code); }
}

function nameOf(ctx, pid) {
  return ctx.players.find((p) => p.id === pid)?.name || 'Someone';
}
function scoreOf(ctx, pid) {
  return ctx.players.find((p) => p.id === pid)?.score || 0;
}
function eligibleToBuzz(ctx) {
  // connected players who are not locked out of the current tile
  return ctx.players.filter((p) => !(ctx.state.lockedOut || []).includes(p.id));
}

function renderControllers(ctx) {
  const s = ctx.state;
  ctx.renderControllers((p) => {
    if (s.phase === 'setup') {
      return { title: '🧠 Buzz Room', subtitle: 'Pick the categories on the TV!', controls: [] };
    }
    if (s.phase === 'board') {
      if (p.id === s.pickerId) {
        const options = [];
        for (const col of s.board.columns) {
          for (const t of col.tiles) {
            if (!t.done) options.push({ id: tileId(col.id, t.value), label: `${col.emoji} ${col.name} ${t.value}` });
          }
        }
        return { title: 'Your pick!', subtitle: 'Choose a category & value', controls: [{ type: 'choices', id: 'tile', options }] };
      }
      return { title: 'Watch the TV', subtitle: `${nameOf(ctx, s.pickerId)} is choosing…`, controls: [] };
    }
    if (s.phase === 'reveal') {
      if ((s.lockedOut || []).includes(p.id)) {
        return { title: 'Locked out', subtitle: 'Someone else can answer this one.', controls: [] };
      }
      return { title: 'Read the TV…', subtitle: 'Tap BUZZ when you know it!', controls: [{ type: 'buzz', id: 'buzz', label: '🔴 BUZZ' }] };
    }
    if (s.phase === 'answer') {
      if (p.id === s.buzzedBy) {
        const opts = s.current.choices.map((label, i) => ({ id: String(i), label }));
        return { title: 'You buzzed — answer!', subtitle: 'Quick, pick one!', controls: [{ type: 'choices', id: 'answer', big: true, options: opts }] };
      }
      return { title: 'Hold on…', subtitle: `${nameOf(ctx, s.buzzedBy)} is answering`, controls: [] };
    }
    if (s.phase === 'resolved') {
      return { title: '⏱️', subtitle: 'Next pick coming up…', controls: [] };
    }
    // over
    const win = s.winner === p.id;
    return {
      title: win ? '🏆 You win!' : 'Good game!',
      subtitle: `Winner: ${nameOf(ctx, s.winner)}`,
      controls: [{ type: 'button', id: 'again', label: '🔁 Play Again', big: true, color: '#22c55e' }],
    };
  });
}

function pushAll(ctx, extra = {}) {
  ctx.renderTV(extra);
  renderControllers(ctx);
}

function startBoard(ctx) {
  const s = ctx.state;
  s.phase = 'board';
  s.current = null;
  s.buzzedBy = null;
  s.lockedOut = [];
  if (boardEmpty(s.board)) return endGame(ctx);
  // Keep the same picker; if the picker is gone, fall back to the first player.
  if (!ctx.players.some((p) => p.id === s.pickerId)) s.pickerId = ctx.players[0]?.id || null;
  pushAll(ctx);
}

function startReveal(ctx, colId, value) {
  const s = ctx.state;
  const tile = findTile(s.board, colId, value);
  if (!tile || tile.done) return;
  s.current = { colId, value, q: tile.q, choices: tile.choices, answer: tile.answer, audio: tile.audio };
  s.buzzedBy = null;
  s.lockedOut = [];
  s.phase = 'reveal';
  s.revealMs = revealMsFor(tile.q);
  pushAll(ctx, { startReveal: true });
  ctx.narrate(tile.q);
  // If nobody buzzes by the time the text finishes + grace, reveal the answer.
  setTimer(ctx.room.code, s.revealMs + REOPEN_GRACE_MS, () => {
    if (ctx.state && ctx.state.phase === 'reveal' && ctx.state.buzzedBy == null) {
      resolveNoBuzz(ctx);
    }
  });
}

function reopenReveal(ctx) {
  const s = ctx.state;
  s.buzzedBy = null;
  s.phase = 'reveal';
  s.revealMs = 0; // text already shown; show it instantly
  // If everyone is locked out, just reveal the answer.
  if (eligibleToBuzz(ctx).length === 0) return resolveNoBuzz(ctx);
  pushAll(ctx, { reopen: true });
  setTimer(ctx.room.code, 6000, () => {
    if (ctx.state && ctx.state.phase === 'reveal' && ctx.state.buzzedBy == null) resolveNoBuzz(ctx);
  });
}

function handleCorrect(ctx, pid) {
  const s = ctx.state;
  const value = s.current.value;
  ctx.addScore(pid, value);
  markDone(ctx);
  s.pickerId = pid;
  s.lastResult = { pid, correct: true, value, answer: s.current.answer };
  s.phase = 'resolved';
  pushAll(ctx, { result: 'correct' });
  ctx.narrate(`${nameOf(ctx, pid)} is right! Plus ${value}.`);
  setTimer(ctx.room.code, RESOLVED_MS, () => { if (ctx.state) startBoard(ctx); });
}

function handleWrong(ctx, pid) {
  const s = ctx.state;
  const value = s.current.value;
  const before = scoreOf(ctx, pid);
  const after = applyScore(before, -value);
  ctx.addScore(pid, after - before); // apply floored delta
  if (!s.lockedOut.includes(pid)) s.lockedOut.push(pid);
  s.lastResult = { pid, correct: false, value, answer: s.current.answer };
  ctx.narrate(`Sorry ${nameOf(ctx, pid)}, that's not it.`);
  reopenReveal(ctx);
}

function resolveNoBuzz(ctx) {
  const s = ctx.state;
  markDone(ctx);
  s.lastResult = { pid: null, correct: false, value: s.current.value, answer: s.current.answer };
  s.phase = 'resolved';
  pushAll(ctx, { result: 'timeout' });
  ctx.narrate(`The answer was ${s.current.choices[s.current.answer]}.`);
  setTimer(ctx.room.code, RESOLVED_MS, () => { if (ctx.state) startBoard(ctx); });
}

function markDone(ctx) {
  const s = ctx.state;
  const tile = findTile(s.board, s.current.colId, s.current.value);
  if (tile) tile.done = true;
}

function endGame(ctx) {
  const s = ctx.state;
  s.phase = 'over';
  s.winner = computeWinner(ctx.players.map((p) => ({ id: p.id, score: p.score })));
  pushAll(ctx, { over: true });
  ctx.narrate(`Game over! The winner is ${nameOf(ctx, s.winner)}!`);
}

function beginWithCategories(ctx, ids) {
  const cats = (Array.isArray(ids) ? ids : []).map(getCategory).filter(Boolean);
  if (cats.length < 2 || cats.length > 4) return; // need 2-4 valid categories
  const s = ctx.state;
  s.categoryIds = cats.map((c) => c.id);
  s.board = buildBoard(cats);
  s.pickerId = ctx.players[0]?.id || null;
  s.lastResult = null;
  s.winner = null;
  startBoard(ctx);
}

export default {
  id: 'jeopardy',
  name: 'Buzz Room',
  emoji: '🧠',
  minPlayers: 1,
  maxPlayers: 8,
  blurb: 'Jeopardy-style trivia. Read the TV, race to BUZZ, answer multiple choice!',

  sync(ctx) {
    // Re-push everything for a reconnecting phone / changed roster.
    if (!ctx.state) return;
    pushAll(ctx);
  },

  init(ctx) {
    ctx.state = {
      phase: 'setup',
      categoryIds: [],
      board: null,
      pickerId: null,
      current: null,
      revealMs: 0,
      buzzedBy: null,
      lockedOut: [],
      lastResult: null,
      winner: null,
      catalogue: categoryList(), // shown on the TV setup screen
    };
    clearTimer(ctx.room.code);
    pushAll(ctx);
    ctx.narrate('Buzz Room! Pick your categories on the TV.');
  },

  // The TV drives setup (and replay) via host:gameAction.
  onHostAction(ctx, action) {
    if (!ctx.state) return;
    if (ctx.state.phase === 'setup' && action.control === 'categories') {
      beginWithCategories(ctx, action.value);
    }
  },

  onAction(ctx, player, action) {
    const s = ctx.state;
    if (!s) return;

    if (s.phase === 'board' && action.control === 'tile') {
      if (player.id !== s.pickerId) return;
      const { colId, value } = parseTileId(action.value);
      startReveal(ctx, colId, value);
      return;
    }

    if (s.phase === 'reveal' && action.control === 'buzz') {
      if (!canBuzz(s, player.id)) return;
      s.buzzedBy = player.id;
      s.phase = 'answer';
      clearTimer(ctx.room.code);
      pushAll(ctx, { buzz: player.id });
      ctx.narrate(`${nameOf(ctx, player.id)} buzzed!`);
      setTimer(ctx.room.code, ANSWER_MS, () => {
        if (ctx.state && ctx.state.phase === 'answer' && ctx.state.buzzedBy === player.id) {
          handleWrong(ctx, player.id); // timeout = wrong
        }
      });
      return;
    }

    if (s.phase === 'answer' && action.control === 'answer') {
      if (player.id !== s.buzzedBy) return;
      clearTimer(ctx.room.code);
      const correct = Number(action.value) === s.current.answer;
      if (correct) handleCorrect(ctx, player.id);
      else handleWrong(ctx, player.id);
      return;
    }

    if (s.phase === 'over' && action.control === 'again') {
      beginWithCategories(ctx, s.categoryIds);
    }
  },
};
```

- [ ] **Step 4: Register the game**

Modify `server/games/index.js`:

```js
// The arcade catalogue. Add a new game = drop a module here and register it.
import snakes from './snakes.js';
import story from './story.js';
import draw from './draw.js';
import mathtug from './mathtug.js';
import laie from './laie.js';
import brawl from './brawl.js';
import jeopardy from './jeopardy/index.js';

const games = [snakes, story, draw, mathtug, laie, brawl, jeopardy];
```

(Leave the rest of the file unchanged.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test server/games/jeopardy/game.test.js`
Expected: PASS — all game.test.js tests green.

Note: the test process exits cleanly because no test waits on a timer; the only pending `setTimeout`s (RESOLVED_MS / ANSWER_MS) are created but Node's test runner finishes when assertions complete and timers are unref'd by process exit. If the process hangs, add `t.after(() => {})` — but it should not.

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS — both `logic.test.js` and `game.test.js`.

- [ ] **Step 7: Commit**

```bash
git add server/games/jeopardy/index.js server/games/jeopardy/game.test.js server/games/index.js
git commit -m "feat(jeopardy): game state machine, buzz/lockout/scoring, tests"
```

---

## Task 5: Controller — buzz view + split buzz

**Files:**
- Modify: `public/js/controller.js` (add `buzz` case in `buildControl`; add split-buzz branch in `renderAll`; add a `sendAs` helper)
- Modify: `public/css/style.css` (buzz button styles)

**Interfaces:**
- Consumes: views with a control `{ type:'buzz', id:'buzz', label }` (sent by the game in `reveal` phase).
- Produces: a big red buzz button that emits `player:action {pid, control:'buzz', value:true}`. When 2+ local seats simultaneously show a buzz-only view, render one button per seat stacked, each attributing to its own seat.

- [ ] **Step 1: Add a `sendAs` helper and the `buzz` control**

In `public/js/controller.js`, just below the existing `send` function (~line 282), add:

```js
function sendAs(pid, control, value) {
  socket.emit('player:action', { pid, control, value });
}
```

Then inside `buildControl(c)`, add a case (place it next to the other `if (c.type === …)` blocks, before the final `return document.createElement('div')`):

```js
  if (c.type === 'buzz') {
    const b = document.createElement('button');
    b.className = 'btn buzz-btn';
    b.textContent = c.label || '🔴 BUZZ';
    b.addEventListener('click', () => send(c.id, true));
    return b;
  }
```

- [ ] **Step 2: Add the split-buzz path in `renderAll`**

Replace the body of `renderAll()` (currently lines ~225-242) with a version that detects multiple simultaneous buzz views and renders them stacked. The new function:

```js
const isBuzzView = (view) => (view.controls || []).length > 0
  && (view.controls || []).every((c) => c.type === 'buzz');

function renderAll() {
  const entries = mySeats.map((s) => seatViews.get(s.pid)).filter(Boolean);
  if (!entries.length) return;

  const activeSet = new Set(entries.filter((e) => isInteractive(e.view)).map((e) => e.seat.pid));

  // Split buzz: 2+ seats on this phone are all showing a buzz button at once.
  const buzzEntries = entries.filter((e) => activeSet.has(e.seat.pid) && isBuzzView(e.view));
  if (buzzEntries.length > 1 && buzzEntries.length === activeSet.size) {
    currentScreen = 'game';
    renderSeatBar(activeSet);
    renderSplitBuzz(buzzEntries);
    return;
  }

  let pick;
  if (entries.length === 1) pick = entries[0];
  else if (activeSet.size === 1) pick = entries.find((e) => activeSet.has(e.seat.pid));
  else if (activeSet.size > 1) pick = entries.find((e) => e.seat.pid === shownPid && activeSet.has(e.seat.pid)) || entries.find((e) => activeSet.has(e.seat.pid));
  else pick = entries.find((e) => e.seat.pid === shownPid) || entries[0];

  currentScreen = 'game';
  shownPid = pick.seat.pid;
  actingPid = pick.seat.pid;
  renderSeatBar(activeSet);
  renderView(pick.view, pick.seat);
}

// One big buzz button per local seat, stacked — two people can hold opposite
// ends of the phone and race. Each button attributes the buzz to its own seat.
function renderSplitBuzz(entries) {
  const first = entries[0];
  $('ctrlTitle').textContent = 'Read the TV — BUZZ!';
  $('ctrlSub').textContent = 'Each player taps their own side.';
  runCleanups();
  controlsEl.innerHTML = '';
  padClear = null;
  const wrap = document.createElement('div');
  wrap.className = 'split-buzz';
  for (const e of entries) {
    const b = document.createElement('button');
    b.className = 'btn buzz-btn split';
    b.innerHTML = `<span class="split-name">${avatarMarkup(e.seat.avatar)} ${e.seat.name}</span><span class="split-label">🔴 BUZZ</span>`;
    b.addEventListener('click', () => sendAs(e.seat.pid, 'buzz', true));
    wrap.appendChild(b);
  }
  controlsEl.appendChild(wrap);
}
```

(Note: `avatarMarkup` already exists in `controller.js`; `runCleanups`, `controlsEl`, `padClear`, `currentScreen`, `shownPid`, `actingPid` are existing module variables.)

- [ ] **Step 3: Add buzz styles**

Append to `public/css/style.css`:

```css
/* ---- Jeopardy buzz buttons (controller) ---- */
.buzz-btn {
  background: #ef4444;
  font-size: 1.6rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  min-height: 120px;
  border-radius: 18px;
}
.buzz-btn:active { transform: scale(0.97); background: #dc2626; }
.split-buzz { display: flex; flex-direction: column; gap: 12px; }
.buzz-btn.split { min-height: 38vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; }
.buzz-btn.split:first-child { transform: rotate(180deg); } /* faces the player across the phone */
.split-name { font-size: 1rem; opacity: 0.9; }
.split-label { font-size: 2rem; }
```

- [ ] **Step 4: Manual smoke test (no automated test for DOM here)**

Run: `npm start`, open the TV at `http://localhost:5858/tv.html` and one phone at `http://localhost:5858/`. (Full game flow is verified in Task 7 — this step just confirms the controller file parses and the page loads with no console errors.)
Expected: phone connects, no JS console errors.

- [ ] **Step 5: Commit**

```bash
git add public/js/controller.js public/css/style.css
git commit -m "feat(jeopardy): controller buzz button + shared-device split buzz"
```

---

## Task 6: TV — renderJeopardy

**Files:**
- Modify: `public/js/tv.js` (add `case 'jeopardy'`, `renderJeopardy`, buzz sound, picker highlight)
- Modify: `public/css/style.css` (board / question styles)

**Interfaces:**
- Consumes: `tv:game` payloads with `gameId:'jeopardy'` and the state shape from Task 4, plus `extra` flags (`startReveal`, `buzz`, `reopen`, `result`, `over`). For setup, `state.catalogue` = `[{id,name,emoji}]`.
- Produces: TV rendering for all phases; emits `host:gameAction {control:'categories', value:[ids]}` from the setup screen.

- [ ] **Step 1: Route jeopardy in the game switch**

In `public/js/tv.js`, add a case to the `switch (payload.gameId)` block (~line 92):

```js
    case 'jeopardy': renderJeopardy(payload); break;
```

- [ ] **Step 2: Highlight the picker in the scorebar**

In `activeTurnId(payload)` (~line 114), add a line so the picker is highlighted:

```js
function activeTurnId(payload) {
  const s = payload.state || {};
  if (s.pickerId) return s.pickerId;
  if (s.order && typeof s.turnIndex === 'number') return s.order[s.turnIndex % s.order.length];
  if (s.drawerId) return s.drawerId;
  return null;
}
```

- [ ] **Step 3: Add the buzz sound + renderJeopardy**

Append to the end of `public/js/tv.js`:

```js
// ---------- Jeopardy "Buzz Room" ----------
let jeoTyper = null;            // interval handle for the type-out animation
let jeoSetupSel = [];           // TV-local category selection during setup

function playBuzz() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ac = new Ctx();
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'square';
    osc.frequency.value = 440;
    gain.gain.value = 0.08;
    osc.connect(gain).connect(ac.destination);
    osc.start();
    osc.frequency.setValueAtTime(660, ac.currentTime + 0.08);
    osc.stop(ac.currentTime + 0.18);
    osc.onended = () => ac.close();
  } catch { /* audio not available */ }
}

function escapeHtmlSafe(s) { return escapeHtml(String(s == null ? '' : s)); }

function renderJeopardy(payload) {
  const s = payload.state || {};
  if (jeoTyper) { clearInterval(jeoTyper); jeoTyper = null; }

  if (s.phase === 'setup') return renderJeoSetup(s);
  if (s.phase === 'over') return renderJeoOver(payload, s);

  // Board grid is the backdrop for board/reveal/answer/resolved.
  const cols = (s.board?.columns) || [];
  const grid = cols.map((col) => {
    const tiles = col.tiles.map((t) => {
      const cur = s.current && s.current.colId === col.id && s.current.value === t.value && s.phase !== 'board';
      const cls = 'jeo-tile' + (t.done ? ' done' : '') + (cur ? ' current' : '');
      return `<div class="${cls}">${t.done ? '' : t.value}</div>`;
    }).join('');
    return `<div class="jeo-col"><div class="jeo-head">${col.emoji}<br>${escapeHtmlSafe(col.name)}</div>${tiles}</div>`;
  }).join('');

  let panel = '';
  if (s.phase === 'board') {
    const picker = (payload.players || []).find((p) => p.id === s.pickerId);
    panel = `<div class="jeo-panel"><div class="jeo-pick">${picker ? escapeHtmlSafe(picker.name) : 'Someone'}, pick a tile on your phone!</div></div>`;
  } else if (s.current) {
    const choices = s.current.choices.map((c, i) =>
      `<div class="jeo-choice" data-i="${i}">${'ABCD'[i]}. ${escapeHtmlSafe(c)}</div>`).join('');
    let banner = 'Everyone: BUZZ on your phone when you know it!';
    if (s.phase === 'answer') {
      const who = (payload.players || []).find((p) => p.id === s.buzzedBy);
      banner = `🔔 ${who ? escapeHtmlSafe(who.name) : 'Someone'} buzzed — answering…`;
    } else if (s.phase === 'resolved') {
      const r = s.lastResult || {};
      const who = (payload.players || []).find((p) => p.id === r.pid);
      banner = r.correct ? `✅ ${escapeHtmlSafe(who?.name || '')} got it! +${r.value}`
        : `❌ The answer was ${'ABCD'[r.answer]}.`;
    }
    panel = `<div class="jeo-panel">
      <div class="jeo-q" id="jeoQ"></div>
      <div class="jeo-choices">${choices}</div>
      <div class="jeo-banner">${banner}</div>
    </div>`;
  }

  gameStage.innerHTML = `<div class="jeo-wrap"><div class="jeo-board">${grid}</div>${panel}</div>`;

  // Reveal: type the question out word-by-word over revealMs.
  if (s.current && (s.phase === 'reveal' || s.phase === 'answer' || s.phase === 'resolved')) {
    const qEl = $('jeoQ');
    const words = s.current.q.split(/\s+/);
    if (s.phase === 'reveal' && s.revealMs > 0 && payload.startReveal) {
      let i = 0;
      const step = Math.max(60, Math.floor(s.revealMs / words.length));
      qEl.textContent = '';
      jeoTyper = setInterval(() => {
        i++;
        qEl.textContent = words.slice(0, i).join(' ');
        if (i >= words.length) { clearInterval(jeoTyper); jeoTyper = null; }
      }, step);
    } else {
      // reopened, answering, resolved, or a reconnect mid-question: show full text.
      qEl.textContent = s.current.q;
    }
  }

  // Highlight the chosen answer once resolved.
  if (s.phase === 'resolved' && s.current) {
    const right = gameStage.querySelector(`.jeo-choice[data-i="${s.current.answer}"]`);
    if (right) right.classList.add('right');
  }

  if (payload.buzz) playBuzz();
}

function renderJeoSetup(s) {
  const cats = s.catalogue || [];
  const cards = cats.map((c) => {
    const on = jeoSetupSel.includes(c.id);
    return `<div class="jeo-cat${on ? ' sel' : ''}" data-id="${c.id}">${c.emoji}<div>${escapeHtmlSafe(c.name)}</div></div>`;
  }).join('');
  const canStart = jeoSetupSel.length >= 2 && jeoSetupSel.length <= 4;
  gameStage.innerHTML = `
    <div class="jeo-setup">
      <h2>Pick 2–4 categories</h2>
      <div class="jeo-cats">${cards}</div>
      <button id="jeoStart" class="jeo-start" ${canStart ? '' : 'disabled'}>Start (${jeoSetupSel.length})</button>
    </div>`;
  gameStage.querySelectorAll('.jeo-cat').forEach((el) => {
    el.addEventListener('click', () => {
      const id = el.dataset.id;
      const i = jeoSetupSel.indexOf(id);
      if (i >= 0) jeoSetupSel.splice(i, 1);
      else if (jeoSetupSel.length < 4) jeoSetupSel.push(id);
      renderJeoSetup(s); // re-render with new selection
    });
  });
  const startBtn = $('jeoStart');
  if (startBtn) startBtn.addEventListener('click', () => {
    if (jeoSetupSel.length >= 2 && jeoSetupSel.length <= 4) {
      socket.emit('host:gameAction', { control: 'categories', value: jeoSetupSel.slice() });
    }
  });
}

function renderJeoOver(payload, s) {
  jeoSetupSel = []; // reset for a possible next game
  const winner = (payload.players || []).find((p) => p.id === s.winner);
  const ranked = [...(payload.players || [])].sort((a, b) => b.score - a.score);
  const rows = ranked.map((p) =>
    `<div class="jeo-rank"><span class="av">${avatarHTML(p.avatar)}</span> ${escapeHtmlSafe(p.name)} — ${p.score}</div>`).join('');
  gameStage.innerHTML = `
    <div class="jeo-over">
      <h1>🏆 ${winner ? escapeHtmlSafe(winner.name) : 'Nobody'} wins!</h1>
      <div class="jeo-ranks">${rows}</div>
      <div class="jeo-banner">Tap “Play Again” on a phone for a rematch.</div>
    </div>`;
}
```

(`escapeHtml`, `avatarHTML`, `$`, `gameStage`, `socket` already exist in `tv.js`.)

- [ ] **Step 4: Add the board / question styles**

Append to `public/css/style.css`:

```css
/* ---- Jeopardy "Buzz Room" (TV) ---- */
.jeo-wrap { display: flex; flex-direction: column; gap: 18px; height: 100%; }
.jeo-board { display: flex; gap: 10px; justify-content: center; }
.jeo-col { display: flex; flex-direction: column; gap: 8px; flex: 1; max-width: 220px; }
.jeo-head { background: #1d1170; color: #ffd84d; font-weight: 800; text-align: center; padding: 10px; border-radius: 10px; min-height: 64px; }
.jeo-tile { background: #2a1b8a; color: #ffd84d; font-size: 2rem; font-weight: 800; text-align: center; padding: 18px 0; border-radius: 10px; }
.jeo-tile.done { background: #160d4a; color: transparent; }
.jeo-tile.current { outline: 4px solid #ffd84d; }
.jeo-panel { background: #1a1033; border-radius: 16px; padding: 24px; text-align: center; flex: 1; display: flex; flex-direction: column; gap: 16px; justify-content: center; }
.jeo-q { font-size: 2.4rem; font-weight: 700; color: #fff; min-height: 3rem; }
.jeo-choices { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; max-width: 900px; margin: 0 auto; width: 100%; }
.jeo-choice { background: #2a1b8a; color: #fff; padding: 14px 18px; border-radius: 12px; font-size: 1.4rem; text-align: left; }
.jeo-choice.right { background: #16a34a; font-weight: 800; }
.jeo-banner { font-size: 1.4rem; color: #ffd84d; }
.jeo-pick { font-size: 2rem; color: #ffd84d; font-weight: 700; }
.jeo-setup { text-align: center; color: #fff; }
.jeo-cats { display: flex; flex-wrap: wrap; gap: 12px; justify-content: center; margin: 18px 0; }
.jeo-cat { background: #2a1b8a; border-radius: 12px; padding: 16px; min-width: 120px; font-size: 2rem; cursor: pointer; }
.jeo-cat div { font-size: 1rem; margin-top: 6px; }
.jeo-cat.sel { outline: 4px solid #ffd84d; background: #3a2bb0; }
.jeo-start { font-size: 1.4rem; font-weight: 800; padding: 14px 28px; border-radius: 12px; border: none; background: #22c55e; color: #04210f; cursor: pointer; }
.jeo-start:disabled { opacity: 0.4; cursor: default; }
.jeo-over { text-align: center; color: #fff; }
.jeo-ranks { margin: 20px auto; max-width: 420px; }
.jeo-rank { background: #1a1033; border-radius: 10px; padding: 10px 16px; margin: 6px 0; font-size: 1.3rem; }
```

- [ ] **Step 5: Verify the server boots and the file parses**

Run: `node --check public/js/tv.js && echo "tv.js OK"`
Expected: `tv.js OK` (no syntax errors).

- [ ] **Step 6: Commit**

```bash
git add public/js/tv.js public/css/style.css
git commit -m "feat(jeopardy): TV board, type-out reveal, buzz sound, setup screen"
```

---

## Task 7: Docs + full manual playtest

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add the game to the README table**

In `README.md`, add a row to the games table (after the Roll the Brawl row):

```markdown
| **Buzz Room (Jeopardy)** | 🧠 | Pick categories on the TV. Questions type out on screen — race to **BUZZ** on your phone, then answer multiple choice. Two people can share a phone and buzz from opposite ends. |
```

- [ ] **Step 2: Note the new host-action hook in the "Adding a new game" section**

In `README.md`, under "Adding a new game", append:

```markdown
4. (Optional) Export `onHostAction(ctx, action)` if the TV needs to drive the
   game (e.g. a setup screen). The TV emits `socket.emit('host:gameAction', { control, value })`.
```

- [ ] **Step 3: Run the full automated suite**

Run: `npm test`
Expected: PASS — all tests across `logic.test.js` and `game.test.js`.

- [ ] **Step 4: Manual living-room playtest**

Run: `npm start`. Open the TV (`http://localhost:5858/tv.html`) and 2 phones (or 1 phone with 2 seats). Verify, in order:
1. Pick "Buzz Room" on the TV → category setup screen shows.
2. Select 3 categories → Start → board appears, first player's phone shows tile choices.
3. Pick a tile → question types out on TV; phones show BUZZ.
4. Buzz on one phone → buzz sound, TV shows "{name} buzzed", that phone shows the 4 choices, others show "is answering".
5. Answer correctly → +value on scorebar, that player becomes picker.
6. Pick another tile, answer wrong → score drops (not below 0), that phone locks out, others can still buzz.
7. Let a question time out with no buzz → TV reveals the answer, same picker continues.
8. Two seats on one phone → during reveal both BUZZ buttons show stacked; tapping either attributes to the right player.
9. Clear the board → winner screen; "Play Again" on a phone restarts with the same categories.

Expected: all behaviors as described; reveal speed and 10s answer clock feel right. Note any pacing tweaks.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: add Buzz Room (Jeopardy) and onHostAction hook"
```

---

## Self-Review Notes

- **Spec coverage:** board + 5 values (Task 2 `buildBoard`, Task 6 grid); type-out reveal (Task 6 typer); buzz lockout + first-wins (Task 4 `onAction`/`canBuzz`, Task 4 tests); wrong = −value floored 0 + reopen (Task 4 `handleWrong`, test); 10s clock (Task 4 `ANSWER_MS`); no-buzz reveal (Task 4 `resolveNoBuzz`); picker = last correct (Task 4 `handleCorrect`); built-in packs, each movie its own category (Task 1); 2–4 categories on TV (Task 6 setup + Task 4 `beginWithCategories` guard); split buzz for shared device (Task 5); audio slot reserved (Task 1 schema, carried through `buildBoard`/`current`); winner = max score (Task 2 `computeWinner`).
- **Placeholder scan:** none — all code blocks are complete; questions are authored in full.
- **Type consistency:** `tileId`/`parseTileId` round-trip used identically in logic, game, and controller; `current` shape `{colId,value,q,choices,answer,audio}` consistent across game + TV; `lastResult` `{pid,correct,value,answer}` consistent; `canBuzz(state,pid)` reads `buzzedBy`/`lockedOut` set the same way the game writes them.
- **Phase-2 audio:** intentionally not built; the `audio` field flows through untouched so it can be wired later without schema change.
```
