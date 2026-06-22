/*
 * app.js — Setup screen + screen switching. Wires the setup form to UI.start().
 */
(function () {
  'use strict';
  const Board = window.Board;

  let count = 3; // default players

  const setupScreen = document.getElementById('setup');
  const gameScreen = document.getElementById('game');
  const countGroup = document.getElementById('count-group');
  const playerRows = document.getElementById('player-rows');
  const startBtn = document.getElementById('start-btn');

  function showScreen(which) {
    setupScreen.classList.toggle('active', which === 'setup');
    gameScreen.classList.toggle('active', which === 'game');
  }

  // Render one name input per playing color for the chosen count.
  function renderPlayerRows() {
    const colors = Board.LAYOUTS[count];
    playerRows.innerHTML = '';
    colors.forEach((color) => {
      const cfg = Board.COLORS[color];
      const row = document.createElement('div');
      row.className = 'player-row';
      row.innerHTML =
        '<span class="swatch" style="background:' + cfg.hex + '"></span>' +
        '<input type="text" maxlength="12" data-color="' + color + '" ' +
        'placeholder="' + cfg.name + '" value="" />';
      playerRows.appendChild(row);
    });
  }

  countGroup.addEventListener('click', (e) => {
    const btn = e.target.closest('.seg-btn');
    if (!btn) return;
    count = parseInt(btn.dataset.count, 10);
    countGroup.querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('active', b === btn));
    renderPlayerRows();
  });

  startBtn.addEventListener('click', () => {
    const colors = Board.LAYOUTS[count];
    const names = {};
    playerRows.querySelectorAll('input').forEach((inp) => {
      const v = inp.value.trim();
      if (v) names[inp.dataset.color] = v;
    });
    showScreen('game');
    // let layout settle before measuring the board
    requestAnimationFrame(() => window.UI.start({ colors, names }));
  });

  // boot
  window.UI.init({ onQuit: () => showScreen('setup') });
  renderPlayerRows();
  showScreen('setup');
})();
