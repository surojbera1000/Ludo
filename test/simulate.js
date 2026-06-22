/* Play many random complete games and assert invariants hold throughout. */
const assert = require('assert');
const Board = require('../js/board.js');
const LudoGame = require('../js/game.js');

function checkInvariants(g) {
  for (const p of g.players) {
    let fin = 0;
    for (const t of p.tokens) {
      assert.ok(t.pathPos >= -1 && t.pathPos <= 56, 'pathPos out of range: ' + t.pathPos);
      assert.strictEqual(t.finished, t.pathPos === 56, 'finished flag mismatch');
      if (t.finished) fin++;
    }
    assert.strictEqual(p.finishedCount, fin, 'finishedCount mismatch for ' + p.color);
  }
  // no two different-colored tokens share a non-safe loop cell
  const occupancy = new Map();
  for (const p of g.players) {
    for (const t of p.tokens) {
      const li = Board.loopIndexForPos(p.color, t.pathPos);
      if (li < 0 || Board.SAFE.has(li)) continue;
      if (!occupancy.has(li)) occupancy.set(li, new Set());
      occupancy.get(li).add(p.color);
    }
  }
  for (const [li, colors] of occupancy) {
    assert.ok(colors.size <= 1, 'two colors coexist on non-safe cell ' + li + ': ' + [...colors]);
  }
}

function playGame(numPlayers, seedRng) {
  const colors = Board.LAYOUTS[numPlayers];
  const g = new LudoGame(colors, { rng: seedRng });
  let guard = 0;
  while (!g.gameOver) {
    if (guard++ > 200000) throw new Error('game did not terminate');
    const res = g.rollDice();
    checkInvariants(g);
    if (res.busted || res.mustPass) continue;
    // pick a random legal move
    const t = res.movable[Math.floor(seedRng() * res.movable.length)];
    g.moveToken(t);
    checkInvariants(g);
  }
  // a winner must exist and have all 4 home
  assert.ok(g.winner, 'no winner recorded');
  const w = g.players.find((p) => p.color === g.winner);
  assert.strictEqual(w.finishedCount, 4, 'winner does not have 4 home');
  // ranks assigned to all but possibly the very last
  const ranked = g.players.filter((p) => p.rank > 0).length;
  assert.ok(ranked >= g.players.length - 1, 'too few players ranked');
  return guard;
}

// simple seeded RNG (mulberry32) for reproducibility
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let totalTurns = 0;
const GAMES = 300;
for (let i = 0; i < GAMES; i++) {
  const n = [2, 3, 4][i % 3];
  totalTurns += playGame(n, mulberry32(i + 1));
}
console.log('Simulated ' + GAMES + ' games to completion with no invariant violations.');
console.log('Avg roll-iterations/game: ' + Math.round(totalTurns / GAMES));
