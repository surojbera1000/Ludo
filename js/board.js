/*
 * board.js — Ludo board geometry and constants.
 *
 * The board is a 15x15 grid. Rows go top->bottom (0..14), cols left->right (0..14).
 * The main track is a 52-cell loop running around the cross shape.
 * Each player travels its own 57-cell path: 51 loop cells + 5 home-column cells + 1 finish.
 */
(function (root) {
  'use strict';

  // --- Build the 52-cell main loop programmatically (clockwise) ---
  function buildLoop() {
    const loop = [];
    for (let c = 1; c <= 5; c++) loop.push([6, c]);   // idx 0-4   (6,1)..(6,5)
    for (let r = 5; r >= 0; r--) loop.push([r, 6]);    // idx 5-10  (5,6)..(0,6)
    loop.push([0, 7]);                                 // idx 11
    for (let r = 0; r <= 5; r++) loop.push([r, 8]);    // idx 12-17 (0,8)..(5,8)
    for (let c = 9; c <= 14; c++) loop.push([6, c]);   // idx 18-23 (6,9)..(6,14)
    loop.push([7, 14]);                                // idx 24
    for (let c = 14; c >= 9; c--) loop.push([8, c]);   // idx 25-30 (8,14)..(8,9)
    for (let r = 9; r <= 14; r++) loop.push([r, 8]);   // idx 31-36 (9,8)..(14,8)
    loop.push([14, 7]);                                // idx 37
    for (let r = 14; r >= 9; r--) loop.push([r, 6]);   // idx 38-43 (14,6)..(9,6)
    for (let c = 5; c >= 0; c--) loop.push([8, c]);    // idx 44-49 (8,5)..(8,0)
    loop.push([7, 0]);                                 // idx 50
    loop.push([6, 0]);                                 // idx 51
    return loop;
  }

  const LOOP = buildLoop(); // 52 cells

  // Safe squares (by loop index): the four colored start cells + four star cells.
  const SAFE = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

  // Per-color configuration.
  // start  = loop index of this color's entry/start cell
  // home   = the 5 home-column cells (leading toward center)
  // base   = the 4 token "parking" cells inside the home quadrant
  // finish = display cell for finished tokens (near center)
  const COLORS = {
    red: {
      name: 'Red',
      hex: '#e5392f',
      start: 0,
      home: [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]],
      base: [[1, 1], [1, 4], [4, 1], [4, 4]],
      finish: [7, 6],
      quadrant: { r0: 0, c0: 0 } // top-left
    },
    green: {
      name: 'Green',
      hex: '#27ae60',
      start: 13,
      home: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]],
      base: [[1, 10], [1, 13], [4, 10], [4, 13]],
      finish: [6, 7],
      quadrant: { r0: 0, c0: 9 } // top-right
    },
    yellow: {
      name: 'Yellow',
      hex: '#f1c40f',
      start: 26,
      home: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]],
      base: [[10, 10], [10, 13], [13, 10], [13, 13]],
      finish: [7, 8],
      quadrant: { r0: 9, c0: 9 } // bottom-right
    },
    blue: {
      name: 'Blue',
      hex: '#2e86de',
      start: 39,
      home: [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]],
      base: [[10, 1], [10, 4], [13, 1], [13, 4]],
      finish: [8, 7],
      quadrant: { r0: 9, c0: 0 } // bottom-left
    }
  };

  // Turn order around the board (clockwise).
  const ORDER = ['red', 'green', 'yellow', 'blue'];

  // Which colors play for a given player count (kept diagonally fair for 2).
  const LAYOUTS = {
    2: ['red', 'yellow'],
    3: ['red', 'green', 'yellow'],
    4: ['red', 'green', 'yellow', 'blue']
  };

  // Path length constants.
  const LOOP_LEN = 52;
  const LAST_LOOP_POS = 50; // pathPos 0..50 are on the shared loop
  const HOME_START_POS = 51; // pathPos 51..55 are the home column
  const FINISH_POS = 56;     // pathPos 56 == finished

  /**
   * Given a color and a token pathPos, return its [row,col] grid cell.
   * pathPos: -1 = base (handled by caller via base array), 0..50 loop,
   *          51..55 home column, 56 finish.
   */
  function cellForPos(color, pathPos) {
    const cfg = COLORS[color];
    if (pathPos < 0) return null; // base — caller decides which base slot
    if (pathPos <= LAST_LOOP_POS) {
      return LOOP[(cfg.start + pathPos) % LOOP_LEN];
    }
    if (pathPos < FINISH_POS) {
      return cfg.home[pathPos - HOME_START_POS];
    }
    return cfg.finish;
  }

  /** Loop index for a token on the shared track, or -1 if not on it. */
  function loopIndexForPos(color, pathPos) {
    if (pathPos < 0 || pathPos > LAST_LOOP_POS) return -1;
    return (COLORS[color].start + pathPos) % LOOP_LEN;
  }

  const Board = {
    LOOP, SAFE, COLORS, ORDER, LAYOUTS,
    LOOP_LEN, LAST_LOOP_POS, HOME_START_POS, FINISH_POS,
    cellForPos, loopIndexForPos
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Board;
  } else {
    root.Board = Board;
  }
})(typeof window !== 'undefined' ? window : this);
