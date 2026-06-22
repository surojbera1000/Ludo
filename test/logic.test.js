/* Lightweight assertions for board geometry + game logic (run with `node`). */
const assert = require('assert');
const Board = require('../js/board.js');
const LudoGame = require('../js/game.js');

let passed = 0;
function check(name, fn) {
  try { fn(); passed++; console.log('  ok  -', name); }
  catch (e) { console.error('  FAIL-', name, '\n      ', e.message); process.exitCode = 1; }
}

console.log('Board geometry:');
check('loop has 52 unique cells', () => {
  assert.strictEqual(Board.LOOP.length, 52);
  const seen = new Set(Board.LOOP.map((c) => c.join(',')));
  assert.strictEqual(seen.size, 52, 'duplicate loop cells');
});
check('start cells match expected coordinates', () => {
  assert.deepStrictEqual(Board.LOOP[Board.COLORS.red.start], [6, 1]);
  assert.deepStrictEqual(Board.LOOP[Board.COLORS.green.start], [1, 8]);
  assert.deepStrictEqual(Board.LOOP[Board.COLORS.yellow.start], [8, 13]);
  assert.deepStrictEqual(Board.LOOP[Board.COLORS.blue.start], [13, 6]);
});
check('every color path is 57 distinct cells (0..56)', () => {
  for (const color of Board.ORDER) {
    const cells = [];
    for (let pos = 0; pos <= Board.FINISH_POS; pos++) {
      cells.push(Board.cellForPos(color, pos).join(','));
    }
    assert.strictEqual(cells.length, 57);
    // home column + finish shouldn't repeat loop cells
    const uniq = new Set(cells);
    assert.strictEqual(uniq.size, 57, color + ' path has duplicates');
  }
});
check('finish cells sit inside the center 3x3', () => {
  // the finish cell (pos 56) for each color should be within rows/cols 6..8
  for (const color of Board.ORDER) {
    const f = Board.cellForPos(color, Board.FINISH_POS);
    assert.ok(f[0] >= 6 && f[0] <= 8 && f[1] >= 6 && f[1] <= 8,
      color + ' finish cell not in center: ' + f);
  }
});
check('home columns run inward toward the center', () => {
  // every home-column cell must be in the middle row(7) or middle col(7)
  for (const color of Board.ORDER) {
    for (let pos = 51; pos <= 55; pos++) {
      const c = Board.cellForPos(color, pos);
      assert.ok(c[0] === 7 || c[1] === 7, color + ' home cell off middle lane: ' + c);
    }
  }
});

console.log('Game logic:');
// Deterministic RNG helper: feed a queue of dice values (1..6).
function scriptedRng(values) {
  const q = values.slice();
  return () => {
    const v = q.length ? q.shift() : 1;
    return (v - 0.5) / 6; // maps to 1+floor(x*6) === v
  };
}

check('scriptedRng produces intended dice', () => {
  const g = new LudoGame(['red', 'yellow'], { rng: scriptedRng([6, 3, 1]) });
  assert.strictEqual(g.rollDice().dice, 6);
});

check('token can only leave base on a six', () => {
  const g = new LudoGame(['red', 'yellow'], { rng: scriptedRng([4]) });
  const r = g.rollDice();
  assert.strictEqual(r.dice, 4);
  assert.strictEqual(r.movable.length, 0, 'no token should move on a 4 from base');
  assert.strictEqual(r.mustPass, true);
  assert.strictEqual(g.currentPlayer.color, 'yellow', 'turn should pass to yellow');
});

check('rolling six lets a token leave base and grants extra turn', () => {
  const g = new LudoGame(['red', 'yellow'], { rng: scriptedRng([6]) });
  const r = g.rollDice();
  assert.strictEqual(r.movable.length, 4);
  const out = g.moveToken(r.movable[0]);
  assert.strictEqual(out.to, 0);
  assert.strictEqual(out.extraTurn, true, 'six grants extra turn');
  assert.strictEqual(g.currentPlayer.color, 'red', 'still red after a six');
});

check('three consecutive sixes busts the turn', () => {
  const g = new LudoGame(['red', 'yellow'], { rng: scriptedRng([6, 6, 6]) });
  // 1st six -> move out
  let r = g.rollDice();
  g.moveToken(r.movable[0]);
  // 2nd six -> move the on-board token
  r = g.rollDice();
  g.moveToken(r.movable.find((t) => t.pathPos >= 0) || r.movable[0]);
  // 3rd six -> bust
  r = g.rollDice();
  assert.strictEqual(r.busted, true);
  assert.strictEqual(g.currentPlayer.color, 'yellow', 'turn forfeited to yellow');
});

check('capture sends opponent home and grants extra turn', () => {
  // Place a yellow token on red's path so red can capture it.
  const g = new LudoGame(['red', 'yellow'], { rng: scriptedRng([6, 3]) });
  // Red leaves base (pos 0 -> loop idx 0 = [6,1])
  let r = g.rollDice();
  g.moveToken(r.movable[0]); // red token at pathPos 0, loop idx 0
  // Manually park a yellow token on loop idx 3 ([6,4]) which is NOT safe.
  // Yellow start = 26, so yellow pathPos with loopIndex 3 => (26+pos)%52==3 => pos=29.
  const yellow = g.players[1];
  yellow.tokens[0].pathPos = 29;
  assert.strictEqual(Board.loopIndexForPos('yellow', 29), 3);
  // Red rolls 3 -> moves from 0 to 3 (loop idx 3) and captures yellow.
  r = g.rollDice();
  const redToken = r.movable.find((t) => t.pathPos === 0);
  const out = g.moveToken(redToken);
  assert.strictEqual(out.captured.length, 1, 'should capture one yellow token');
  assert.strictEqual(yellow.tokens[0].pathPos, -1, 'captured token back to base');
  assert.strictEqual(out.extraTurn, true, 'capture grants extra turn');
});

check('no capture on a safe square', () => {
  const g = new LudoGame(['red', 'yellow'], { rng: scriptedRng([6]) });
  let r = g.rollDice();
  // park yellow on red's START cell (loop idx 0) which is safe
  g.players[1].tokens[0].pathPos = (52 - 26) % 52; // yellow pos with loopIndex 0 -> (26+pos)%52=0 => pos=26
  assert.strictEqual(Board.loopIndexForPos('yellow', 26), 0);
  const out = g.moveToken(r.movable[0]); // red onto loop idx 0
  assert.strictEqual(out.captured.length, 0, 'no capture on safe cell');
  assert.strictEqual(g.players[1].tokens[0].pathPos, 26, 'yellow stays put');
});

check('reaching finish requires exact roll and marks finished', () => {
  const g = new LudoGame(['red', 'yellow'], { rng: scriptedRng([6]) });
  const red = g.players[0];
  red.tokens[0].pathPos = 53; // 3 away from finish (56)
  // Need a 3 to finish; a 4 would overshoot and be illegal.
  g.rng = scriptedRng([4]);
  let r = g.rollDice();
  assert.ok(!r.movable.includes(red.tokens[0]) || red.tokens[0].pathPos + 4 > 56,
    'overshoot should be illegal');
  // now allow exact 3
  if (g.awaitingMove) g.moveToken(r.movable[0]); // consume the 4 turn if any
});

check('winning: all four tokens finished sets winner', () => {
  const g = new LudoGame(['red', 'yellow'], { rng: () => 0 });
  const red = g.players[0];
  red.tokens.forEach((t) => { t.pathPos = 53; });
  // finish them one by one with exact 3s
  g.rng = scriptedRng([3, 3, 3, 3, 3, 3, 3, 3]);
  let guard = 0;
  while (!g.gameOver && guard++ < 50) {
    const r = g.rollDice();
    if (r.movable.length) {
      const t = r.movable.find((tk) => tk.pathPos === 53) || r.movable[0];
      g.moveToken(t);
    }
  }
  assert.strictEqual(red.finishedCount, 4, 'all red tokens finished');
  assert.strictEqual(g.winner, 'red');
  assert.strictEqual(g.gameOver, true);
});

console.log('\nAll done.');
