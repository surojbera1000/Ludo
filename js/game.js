/*
 * game.js — Core Ludo game logic (UI-agnostic, deterministic & testable).
 *
 * A LudoGame instance holds the full game state and exposes intent methods:
 *   rollDice()            -> roll the die for the current player
 *   getMovableTokens()    -> tokens that can legally move with the current roll
 *   moveToken(token)      -> apply a move, returns an outcome describing what happened
 *
 * The class never touches the DOM. The UI layer observes state and calls these.
 */
(function (root) {
  'use strict';

  const Board = (typeof module !== 'undefined' && module.exports)
    ? require('./board.js')
    : root.Board;

  class LudoGame {
    /**
     * @param {string[]} colors  ordered list of playing colors (e.g. ['red','yellow'])
     * @param {object}   opts    { names?: {color:name}, rng?: ()=>float }
     */
    constructor(colors, opts = {}) {
      this.rng = opts.rng || Math.random;
      const names = opts.names || {};
      this.players = colors.map((color, i) => ({
        index: i,
        color,
        name: names[color] || Board.COLORS[color].name,
        tokens: [0, 1, 2, 3].map((id) => ({
          id,
          color,
          pathPos: -1,        // -1 = in base
          finished: false
        })),
        finishedCount: 0,
        rank: 0               // finishing place (1st, 2nd...), 0 = still playing
      }));
      this.turn = 0;                 // index into this.players
      this.dice = null;              // last rolled value, or null
      this.awaitingMove = false;     // true after a roll that has legal moves
      this.consecutiveSixes = 0;
      this.rankCounter = 0;          // how many players have finished
      this.winner = null;            // first finisher's color
      this.gameOver = false;
      this.lastOutcome = null;
    }

    get currentPlayer() {
      return this.players[this.turn];
    }

    activePlayers() {
      return this.players.filter((p) => p.rank === 0);
    }

    /** Roll the die. Returns { dice, movable, mustPass, busted }. */
    rollDice() {
      if (this.gameOver || this.awaitingMove) {
        throw new Error('Cannot roll right now.');
      }
      const value = 1 + Math.floor(this.rng() * 6);
      this.dice = value;

      if (value === 6) this.consecutiveSixes++;
      else this.consecutiveSixes = 0;

      // Three sixes in a row: turn is forfeited.
      if (this.consecutiveSixes === 3) {
        this.lastOutcome = { type: 'busted' };
        this._endTurn(false);
        return { dice: value, movable: [], mustPass: true, busted: true };
      }

      const movable = this.getMovableTokens();
      if (movable.length === 0) {
        // No legal move: end turn unless the six entitles another roll
        // (still no move, so pass — but a 6 with no move just passes too).
        this._endTurn(false);
        return { dice: value, movable: [], mustPass: true, busted: false };
      }

      this.awaitingMove = true;
      return { dice: value, movable, mustPass: false, busted: false };
    }

    /** Tokens of the current player that can legally move with the current dice. */
    getMovableTokens() {
      if (this.dice == null) return [];
      const p = this.currentPlayer;
      return p.tokens.filter((t) => this._canMove(t, this.dice));
    }

    _canMove(token, dice) {
      if (token.finished) return false;
      if (token.pathPos < 0) {
        return dice === 6; // can only leave base on a six
      }
      return token.pathPos + dice <= Board.FINISH_POS;
    }

    /**
     * Apply a move for the given token (must be one of getMovableTokens()).
     * Returns an outcome: { moved, from, to, captured:[...], finishedToken, extraTurn, win }.
     */
    moveToken(token) {
      if (!this.awaitingMove) throw new Error('Roll the die first.');
      if (!this._canMove(token, this.dice)) throw new Error('Illegal move.');

      const p = this.currentPlayer;
      const from = token.pathPos;
      let to;
      if (from < 0) {
        to = 0; // leave base onto start cell
      } else {
        to = from + this.dice;
      }
      token.pathPos = to;

      let finishedToken = false;
      if (to === Board.FINISH_POS) {
        token.finished = true;
        finishedToken = true;
        p.finishedCount++;
      }

      // Resolve captures on the shared loop (not on safe cells).
      const captured = this._resolveCaptures(p, token);

      // Win / rank handling.
      let win = false;
      if (p.finishedCount === 4 && p.rank === 0) {
        this.rankCounter++;
        p.rank = this.rankCounter;
        if (!this.winner) {
          this.winner = p.color;
          win = true;
        }
      }

      // Decide whether the game is over.
      // Game ends when at most one active player remains.
      if (this.activePlayers().length <= 1) {
        // Assign final rank to the last remaining player, if any.
        const remaining = this.activePlayers();
        if (remaining.length === 1 && remaining[0].rank === 0) {
          this.rankCounter++;
          remaining[0].rank = this.rankCounter;
        }
        this.gameOver = true;
      }

      const rolledSix = this.dice === 6;
      const extraTurn = !this.gameOver &&
        (rolledSix || captured.length > 0 || finishedToken);

      const outcome = {
        moved: true,
        token,
        color: p.color,
        from,
        to,
        captured,
        finishedToken,
        extraTurn,
        win,
        gameOver: this.gameOver
      };
      this.lastOutcome = outcome;

      this.awaitingMove = false;
      this.dice = null;
      if (!extraTurn && !this.gameOver) {
        this._advanceTurn();
      } else if (extraTurn) {
        // keep same player; reset consecutive-six tracking handled in rollDice
      }
      return outcome;
    }

    _resolveCaptures(player, token) {
      const myLoop = Board.loopIndexForPos(player.color, token.pathPos);
      const captured = [];
      if (myLoop < 0) return captured;          // in home column / finished
      if (Board.SAFE.has(myLoop)) return captured; // safe cell, no capture
      for (const other of this.players) {
        if (other.color === player.color) continue;
        for (const ot of other.tokens) {
          if (ot.finished || ot.pathPos < 0) continue;
          const oLoop = Board.loopIndexForPos(other.color, ot.pathPos);
          if (oLoop === myLoop) {
            ot.pathPos = -1; // send home to base
            captured.push(ot);
            if (other.finishedCount > 0 && ot.finished) other.finishedCount--;
          }
        }
      }
      return captured;
    }

    /** End the current turn with no move (pass). */
    _endTurn() {
      this.awaitingMove = false;
      this.dice = null;
      if (!this.gameOver) this._advanceTurn();
    }

    _advanceTurn() {
      this.consecutiveSixes = 0;
      // advance to next active player
      let next = this.turn;
      for (let i = 0; i < this.players.length; i++) {
        next = (next + 1) % this.players.length;
        if (this.players[next].rank === 0) break;
      }
      this.turn = next;
    }

    /** A serialisable snapshot for the UI/tests. */
    snapshot() {
      return {
        turn: this.turn,
        currentColor: this.currentPlayer.color,
        dice: this.dice,
        awaitingMove: this.awaitingMove,
        gameOver: this.gameOver,
        winner: this.winner,
        players: this.players.map((p) => ({
          color: p.color,
          name: p.name,
          finishedCount: p.finishedCount,
          rank: p.rank,
          tokens: p.tokens.map((t) => ({ id: t.id, pathPos: t.pathPos, finished: t.finished }))
        }))
      };
    }
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = LudoGame;
  } else {
    root.LudoGame = LudoGame;
  }
})(typeof window !== 'undefined' ? window : this);
