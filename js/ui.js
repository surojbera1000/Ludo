/*
 * ui.js — Rendering and interaction for the Ludo board.
 * Builds the 15x15 grid, draws tokens as DOM elements, handles dice + taps,
 * animates moves, and runs the turn flow. Talks to LudoGame via its API.
 */
(function (root) {
  'use strict';
  const Board = root.Board;

  const el = {};
  let game = null;
  let config = null;          // { colors, names }
  let tokenEls = new Map();   // "color-id" -> HTMLElement
  let movable = [];           // current movable tokens
  let busy = false;           // true while animating / rolling
  let onQuit = function () {};

  const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));
  const DICE_FACES = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

  function $(id) { return document.getElementById(id); }

  function cacheEls() {
    el.board = $('board');
    el.dice = $('dice');
    el.diceFace = $('dice-face');
    el.message = $('message');
    el.turnName = $('turn-name');
    el.turnDot = document.querySelector('#turn-pill .dot');
    el.strip = $('player-strip');
    el.overlay = $('overlay');
    el.modalTitle = $('modal-title');
    el.ranking = $('ranking');
    el.menuSheet = $('menu-sheet');
  }

  // ---- geometry helpers ----
  function cellPx() { return el.board.getBoundingClientRect().width / 15; }
  function centerOf(rc) {
    const px = cellPx();
    return { x: (rc[1] + 0.5) * px, y: (rc[0] + 0.5) * px };
  }
  function fitBoard() {
    const wrap = el.board.parentElement;
    const pad = 20;
    const avail = Math.min(wrap.clientWidth - pad, wrap.clientHeight - pad, 560);
    const cell = Math.floor(avail / 15);
    document.documentElement.style.setProperty('--cell', cell + 'px');
  }

  // ---- board construction ----
  function buildBoard(colors) {
    el.board.innerHTML = '';

    // lookup maps for arm cells
    const homeMap = new Map();   // "r,c" -> color
    const loopMap = new Map();   // "r,c" -> loopIndex
    const startCells = new Map();// "r,c" -> color
    Board.ORDER.forEach((color) => {
      Board.COLORS[color].home.forEach((rc) => homeMap.set(rc.join(','), color));
    });
    Board.LOOP.forEach((rc, idx) => loopMap.set(rc.join(','), idx));
    Board.ORDER.forEach((color) => {
      startCells.set(Board.LOOP[Board.COLORS[color].start].join(','), color);
    });

    for (let r = 0; r < 15; r++) {
      for (let c = 0; c < 15; c++) {
        const div = document.createElement('div');
        div.className = 'cell';
        const key = r + ',' + c;
        const inCenter = r >= 6 && r <= 8 && c >= 6 && c <= 8;
        if (inCenter) {
          div.classList.add('void');
        } else if (r <= 5 && c <= 5) {
          div.classList.add('q-red');
        } else if (r <= 5 && c >= 9) {
          div.classList.add('q-green');
        } else if (r >= 9 && c >= 9) {
          div.classList.add('q-yellow');
        } else if (r >= 9 && c <= 5) {
          div.classList.add('q-blue');
        } else if (homeMap.has(key)) {
          div.classList.add('home-' + homeMap.get(key));
        } else if (loopMap.has(key)) {
          div.classList.add('track');
          const idx = loopMap.get(key);
          if (startCells.has(key)) div.classList.add('start-' + startCells.get(key), 'safe');
          else if (Board.SAFE.has(idx)) div.classList.add('safe');
        } else {
          div.classList.add('void');
        }
        el.board.appendChild(div);
      }
    }

    // base pads + slots for playing colors
    colors.forEach((color) => addBasePad(color));

    // center finish triangle
    addCenter();
  }

  function addBasePad(color) {
    const cfg = Board.COLORS[color];
    const rows = cfg.base.map((b) => b[0]);
    const cols = cfg.base.map((b) => b[1]);
    const rMin = Math.min(...rows), cMin = Math.min(...cols);
    const pad = document.createElement('div');
    pad.className = 'base-pad';
    pad.style.left = 'calc(var(--cell) * ' + (cMin - 0.35) + ')';
    pad.style.top = 'calc(var(--cell) * ' + (rMin - 0.35) + ')';
    pad.style.width = 'calc(var(--cell) * 3.7)';
    pad.style.height = 'calc(var(--cell) * 3.7)';
    el.board.appendChild(pad);

    cfg.base.forEach((rc) => {
      const slot = document.createElement('div');
      slot.className = 'base-slot';
      slot.style.left = 'calc(var(--cell) * ' + (rc[1] + 0.1) + ')';
      slot.style.top = 'calc(var(--cell) * ' + (rc[0] + 0.1) + ')';
      slot.style.width = 'calc(var(--cell) * 0.8)';
      slot.style.height = 'calc(var(--cell) * 0.8)';
      slot.style.boxShadow = 'inset 0 0 0 3px ' + cfg.hex;
      el.board.appendChild(slot);
    });
  }

  function addCenter() {
    const wrap = document.createElement('div');
    wrap.className = 'center';
    // left=red, top=green, right=yellow, bottom=blue
    wrap.innerHTML =
      '<svg viewBox="0 0 100 100" preserveAspectRatio="none">' +
      '<polygon points="0,0 50,50 0,100" fill="' + Board.COLORS.red.hex + '"/>' +
      '<polygon points="0,0 50,50 100,0" fill="' + Board.COLORS.green.hex + '"/>' +
      '<polygon points="100,0 50,50 100,100" fill="' + Board.COLORS.yellow.hex + '"/>' +
      '<polygon points="0,100 50,50 100,100" fill="' + Board.COLORS.blue.hex + '"/>' +
      '</svg>';
    el.board.appendChild(wrap);
  }

  // ---- token elements ----
  function buildTokens(colors) {
    tokenEls.clear();
    // remove old
    el.board.querySelectorAll('.token').forEach((n) => n.remove());
    colors.forEach((color) => {
      for (let id = 0; id < 4; id++) {
        const t = document.createElement('div');
        t.className = 'token ' + color;
        t.dataset.key = color + '-' + id;
        t.addEventListener('click', () => onTokenTap(color, id));
        el.board.appendChild(t);
        tokenEls.set(color + '-' + id, t);
      }
    });
  }

  function tokenCellRC(player, token) {
    if (token.pathPos < 0) {
      return Board.COLORS[player.color].base[token.id];
    }
    return Board.cellForPos(player.color, token.pathPos);
  }

  // place every token; recompute stacking & movable highlight
  function render() {
    const movableKeys = new Set(movable.map((t) => t.color + '-' + t.id));

    // group tokens by destination cell to fan out stacks
    const cellGroups = new Map();
    game.players.forEach((p) => {
      p.tokens.forEach((t) => {
        const rc = tokenCellRC(p, t);
        const key = rc.join(',');
        if (!cellGroups.has(key)) cellGroups.set(key, []);
        cellGroups.get(key).push({ p, t, rc });
      });
    });

    cellGroups.forEach((group) => {
      group.forEach((item, i) => {
        const node = tokenEls.get(item.p.color + '-' + item.t.id);
        if (!node) return;
        const ctr = centerOf(item.rc);
        node.style.left = ctr.x + 'px';
        node.style.top = ctr.y + 'px';
        node.classList.remove('stack-1', 'stack-2', 'stack-3');
        if (group.length > 1 && i > 0) node.classList.add('stack-' + i);
        node.classList.toggle('movable', movableKeys.has(item.p.color + '-' + item.t.id));
        node.textContent = item.t.finished ? '✓' : '';
      });
    });
  }

  // ---- status / messages ----
  function setMessage(txt) { el.message.textContent = txt; }

  function updateStatus() {
    const p = game.currentPlayer;
    el.turnName.textContent = p.name;
    el.turnDot.style.background = Board.COLORS[p.color].hex;
    // chips
    el.strip.innerHTML = '';
    game.players.forEach((pl) => {
      const chip = document.createElement('div');
      chip.className = 'chip' + (pl.index === game.turn ? ' active' : '');
      const done = pl.finishedCount;
      chip.innerHTML =
        '<span class="dot" style="background:' + Board.COLORS[pl.color].hex + '"></span>' +
        '<span>' + pl.name + '</span>' +
        '<span class="done">' + done + '/4</span>';
      el.strip.appendChild(chip);
    });
  }

  // ---- flow ----
  function enableDice(on) {
    el.dice.disabled = !on;
  }

  async function onDiceClick() {
    if (busy || game.gameOver || game.awaitingMove) return;
    busy = true;
    enableDice(false);
    el.dice.classList.add('rolling');
    el.diceFace.textContent = '🎲';
    await SLEEP(450);
    el.dice.classList.remove('rolling');

    const res = game.rollDice();
    el.diceFace.textContent = DICE_FACES[res.dice];

    if (res.busted) {
      setMessage('Three 6s in a row — turn lost!');
      await SLEEP(900);
      finishTurnTransition();
      return;
    }
    if (res.mustPass) {
      setMessage('Rolled ' + res.dice + ' — no moves available');
      await SLEEP(900);
      finishTurnTransition();
      return;
    }

    movable = res.movable;
    render();
    if (movable.length === 1) {
      setMessage('Rolled ' + res.dice);
      await SLEEP(400);
      await performMove(movable[0]);
    } else {
      setMessage('Rolled ' + res.dice + ' — tap a glowing token');
      busy = false; // allow tapping
    }
  }

  function onTokenTap(color, id) {
    if (busy || !game.awaitingMove) return;
    if (color !== game.currentPlayer.color) return;
    const token = movable.find((t) => t.color === color && t.id === id);
    if (!token) return;
    busy = true;
    performMove(token);
  }

  async function performMove(token) {
    const color = token.color;
    const from = token.pathPos;
    const outcome = game.moveToken(token);
    movable = [];
    render(); // clears highlight

    await animateMove(color, token.id, from, outcome.to);

    // animate captured tokens flying home
    if (outcome.captured.length) {
      render();
      const names = outcome.captured.map((c) => Board.COLORS[c.color].name);
      setMessage(Board.COLORS[color].name + ' captured ' + names.join(' & ') + '!');
      await SLEEP(500);
    }

    render();
    updateStatus();

    if (outcome.gameOver) {
      showGameOver();
      return;
    }
    if (outcome.win) {
      // a player finished but game continues for remaining places
      setMessage(Board.COLORS[color].name + ' finished all tokens!');
    }
    if (outcome.extraTurn) {
      const why = outcome.finishedToken ? 'Token home!' :
        (outcome.captured.length ? 'Capture!' : 'Rolled a 6!');
      setMessage(why + ' ' + game.currentPlayer.name + ' rolls again');
      busy = false;
      enableDice(true);
    } else {
      finishTurnTransition();
    }
  }

  function finishTurnTransition() {
    movable = [];
    render();
    updateStatus();
    setMessage(game.currentPlayer.name + ', tap to roll');
    busy = false;
    enableDice(true);
  }

  // step the moving token cell-by-cell for a nice slide
  async function animateMove(color, id, fromPos, toPos) {
    const node = tokenEls.get(color + '-' + id);
    const player = game.players.find((p) => p.color === color);
    node.style.zIndex = 20;
    if (fromPos < 0) {
      // leaving base -> jump straight to start cell
      const ctr = centerOf(Board.cellForPos(color, 0));
      node.style.left = ctr.x + 'px';
      node.style.top = ctr.y + 'px';
      await SLEEP(180);
    } else {
      for (let pos = fromPos + 1; pos <= toPos; pos++) {
        const ctr = centerOf(Board.cellForPos(color, pos));
        node.style.left = ctr.x + 'px';
        node.style.top = ctr.y + 'px';
        await SLEEP(130);
      }
    }
    node.style.zIndex = 5;
  }

  // ---- game over modal ----
  function showGameOver() {
    const ranked = game.players.slice().sort((a, b) => {
      const ra = a.rank || 99, rb = b.rank || 99;
      if (ra !== rb) return ra - rb;
      return b.finishedCount - a.finishedCount;
    });
    el.modalTitle.textContent = '🏆 ' + game.players.find((p) => p.color === game.winner).name + ' wins!';
    el.ranking.innerHTML = '';
    const medals = ['🥇', '🥈', '🥉', '4️⃣'];
    ranked.forEach((p, i) => {
      const li = document.createElement('li');
      li.innerHTML =
        '<span class="place">' + (medals[i] || (i + 1)) + '</span>' +
        '<span class="dot" style="background:' + Board.COLORS[p.color].hex + '"></span>' +
        '<span>' + p.name + '</span>' +
        '<span class="done" style="margin-left:auto">' + p.finishedCount + '/4</span>';
      el.ranking.appendChild(li);
    });
    el.overlay.classList.add('show');
    enableDice(false);
  }

  // ---- public API ----
  function start(cfg) {
    config = cfg;
    el.overlay.classList.remove('show');
    el.menuSheet.classList.remove('show');
    game = new root.LudoGame(cfg.colors, { names: cfg.names });
    fitBoard();
    buildBoard(cfg.colors);
    buildTokens(cfg.colors);
    render();
    updateStatus();
    setMessage(game.currentPlayer.name + ', tap to roll');
    busy = false;
    enableDice(true);
  }

  function init(opts) {
    cacheEls();
    onQuit = (opts && opts.onQuit) || onQuit;
    el.dice.addEventListener('click', onDiceClick);
    $('rematch-btn').addEventListener('click', () => start(config));
    $('newgame-btn').addEventListener('click', () => { el.overlay.classList.remove('show'); onQuit(); });
    $('menu-btn').addEventListener('click', () => el.menuSheet.classList.add('show'));
    $('resume-btn').addEventListener('click', () => el.menuSheet.classList.remove('show'));
    $('quit-btn').addEventListener('click', () => { el.menuSheet.classList.remove('show'); onQuit(); });
    window.addEventListener('resize', () => { if (game) { fitBoard(); render(); } });
    window.addEventListener('orientationchange', () => { if (game) { setTimeout(() => { fitBoard(); render(); }, 200); } });
  }

  root.UI = { init, start };
})(typeof window !== 'undefined' ? window : this);
