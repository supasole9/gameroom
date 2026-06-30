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
