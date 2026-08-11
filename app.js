// Contrôleur de l'interface : gère l'état de la partie et le rendu des écrans.
'use strict';

(function () {
  const CORNER_NAMES = Game.BOARD_EDGES.map((e) => e.name);
  // Côtés de chaque tuile qui forment un couple avec la tuile voisine (mots tournés
  // vers l'extérieur du plateau, cf. Game.BOARD_EDGES). Dérivé automatiquement.
  const EXTERIOR_SIDES = [new Set(), new Set(), new Set(), new Set()];
  Game.BOARD_EDGES.forEach(({ a, b }) => {
    EXTERIOR_SIDES[a.slot].add(a.side);
    EXTERIOR_SIDES[b.slot].add(b.side);
  });
  // Index des bords (0-3) touchant chaque case (chaque tuile touche exactement 2 bords).
  const SLOT_EDGES = [[], [], [], []];
  Game.BOARD_EDGES.forEach(({ a, b }, i) => {
    SLOT_EDGES[a.slot].push(i);
    SLOT_EDGES[b.slot].push(i);
  });
  const MIN_PLAYERS = 3;
  const MAX_PLAYERS = 8;

  const app = document.getElementById('app');

  /** @type {any} */
  let state = null;
  /** @type {any} état du glisser-déposer en cours (null si aucun) */
  let dragState = null;

  function esc(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function freshState() {
    return {
      screen: 'setup',
      playerCount: 4,
      players: ['', '', '', ''],
      roundIndex: 0,
      round: null,
      clues: ['', '', '', ''],
      guess: { slots: [null, null, null, null], tray: [], trayScatter: {}, tileRotations: {}, lockedSlots: [false, false, false, false], attempts: 0 },
      selectedTrayTile: null,
      lastResult: null,
      scores: [],
      totalScore: 0,
      maxScore: 0,
      nextScreenAfterTransition: '',
      rulesOpen: false,
    };
  }

  function findTile(round, tileId) {
    return round.tiles.find((t) => t.id === tileId) || null;
  }

  function tileFaceHTML(words, exteriorSet, opts) {
    opts = opts || {};
    const cls = opts.extraClass || '';
    return `
      <div class="tile-face ${cls}">
        <div class="side side-top${exteriorSet.has('T') ? ' exterior' : ''}">${esc(words.T)}</div>
        <div class="side side-right${exteriorSet.has('R') ? ' exterior' : ''}">${esc(words.R)}</div>
        <div class="side side-bottom${exteriorSet.has('B') ? ' exterior' : ''}">${esc(words.B)}</div>
        <div class="side side-left${exteriorSet.has('L') ? ' exterior' : ''}">${esc(words.L)}</div>
        <div class="side-center">${opts.centerHTML || ''}</div>
      </div>`;
  }

  function cloverHTML(arrangement, opts) {
    opts = opts || {};
    const lockedSlots = opts.lockedSlots || [false, false, false, false];
    let cells = '';
    for (let i = 0; i < 4; i++) {
      const cell = arrangement[i];
      const locked = lockedSlots[i];
      if (cell) {
        const words = Game.wordsAt(cell.tile, cell.rotation);
        let centerHTML = '';
        if (locked) {
          centerHTML = '<span class="lock-icon" title="Bonne tuile, verrouillée">🔒</span>';
        } else if (opts.interactive) {
          centerHTML = `<button class="rotate-btn" data-action="rotate-slot" data-slot="${i}" title="Tourner">⟳</button>`;
        } else if (opts.tileReroll) {
          centerHTML = `<button class="rotate-btn reroll-tile-btn" data-action="reroll-tile" data-slot="${i}" title="Retirer cette tuile et en tirer une autre">🎲</button>`;
        }
        cells += `<div class="clover-cell slot-${i}${opts.interactive && !locked ? ' clickable' : ''}${locked ? ' locked' : ''}" data-slot="${i}">
          ${tileFaceHTML(words, EXTERIOR_SIDES[i], { centerHTML })}
        </div>`;
      } else {
        cells += `<div class="clover-cell slot-${i} empty${opts.interactive ? ' clickable' : ''}" data-slot="${i}">
          <div class="empty-slot">+</div>
        </div>`;
      }
    }
    return `<div class="clover">${cells}</div>`;
  }

  /** Assemble le trèfle avec ses 4 indices/mots positionnés directement sur les bords du plateau. */
  function boardHTML(arrangement, opts, edgesHTML) {
    return `
      <div class="board">
        <div class="edge edge-top">${edgesHTML[0]}</div>
        <div class="edge edge-right">${edgesHTML[1]}</div>
        <div class="edge edge-bottom">${edgesHTML[2]}</div>
        <div class="edge edge-left">${edgesHTML[3]}</div>
        ${cloverHTML(arrangement, opts)}
      </div>`;
  }

  function trayHTML(round, guess) {
    const rotations = guess.tileRotations;
    return `<div class="tray">${guess.tray.map((tileId) => {
      const tile = findTile(round, tileId);
      const words = Game.wordsAt(tile, rotations[tileId] || 0);
      const selected = state.selectedTrayTile === tileId;
      const scatter = guess.trayScatter[tileId] || { dx: 0, dy: 0, rot: 0 };
      const scatterStyle = selected ? '' : ` style="transform: translate(${scatter.dx}px, ${scatter.dy}px) rotate(${scatter.rot}deg);"`;
      return `<div class="tray-tile${selected ? ' selected' : ''}" data-tile="${tileId}"${scatterStyle}>
        ${tileFaceHTML(words, new Set(), { centerHTML: `<button class="rotate-btn" data-action="rotate-tray" data-tile="${tileId}" title="Tourner">⟳</button>` })}
      </div>`;
    }).join('')}</div>`;
  }

  function renderSetup() {
    const best = Storage.bestScore ? Storage.bestScore() : null;
    const nameInputs = state.players.map((name, i) => `
      <div class="player-row">
        <input type="text" class="player-name" data-index="${i}" placeholder="Joueur ${i + 1}" value="${esc(name)}" maxlength="20" />
        ${state.players.length > MIN_PLAYERS ? `<button class="btn-icon" data-action="remove-player" data-index="${i}" title="Retirer">✕</button>` : ''}
      </div>`).join('');

    app.innerHTML = `
      <section class="screen screen-setup">
        <h1>🍀 Trèfle &amp; Indices</h1>
        <p class="subtitle">Jeu d'association de mots, inspiré de So Clover!, jouable hors-ligne à plusieurs sur un seul appareil.</p>
        ${best ? `<p class="best-score">Meilleur score : ${best.totalScore}/${best.maxScore} (${Math.round(best.ratio * 100)}%)</p>` : ''}
        <h2>Joueurs (3 à 8)</h2>
        <div class="player-list">${nameInputs}</div>
        <div class="setup-actions">
          <button class="btn btn-secondary" data-action="add-player" ${state.players.length >= MAX_PLAYERS ? 'disabled' : ''}>+ Ajouter un joueur</button>
        </div>
        <button class="btn btn-primary btn-large" data-action="start-game">Commencer la partie</button>
        <button class="btn btn-link" data-action="toggle-rules">📖 Règles du jeu</button>
        ${state.rulesOpen ? renderRules() : ''}
      </section>`;
  }

  function renderRules() {
    return `
      <div class="rules-box">
        <h3>Règles</h3>
        <p>Un trèfle à 4 cases reçoit 4 tuiles tirées au hasard, chacune portant 4 mots (un par face). Sur chacun des 4 bords du plateau, les mots extérieurs de deux tuiles voisines se retrouvent côte à côte : c'est une paire.</p>
        <p>Le donneur d'indices de la manche voit la disposition secrète et propose un indice (un mot ou une courte expression) pour chacune des 4 paires, directement sur le bord concerné.</p>
        <p>Les autres joueurs récupèrent les 4 tuiles (mélangées et retournées au hasard) <strong>+ une 5<sup>e</sup> tuile piège</strong>, et doivent replacer les bonnes tuiles dans le bon sens sur le trèfle à l'aide des 4 indices.</p>
        <p>Chaque joueur est donneur d'indices une fois. Le score de l'équipe est le total des paires correctement reconstituées sur toutes les manches.</p>
      </div>`;
  }

  function renderTransition() {
    const clueGiver = state.players[state.roundIndex % state.players.length];
    const forGuess = state.nextScreenAfterTransition === 'guess';
    app.innerHTML = `
      <section class="screen screen-transition">
        <h2>Manche ${state.roundIndex + 1} / ${state.players.length}</h2>
        ${forGuess
          ? `<p class="transition-text">Passe l'appareil à tout le monde <strong>sauf ${esc(clueGiver)}</strong>.<br>Vous allez recevoir les indices et devoir replacer les tuiles.</p>`
          : `<p class="transition-text">Passe l'appareil à <strong>${esc(clueGiver)}</strong>.<br>Les autres ne doivent pas regarder l'écran !</p>`}
        <button class="btn btn-primary btn-large" data-action="reveal">Je suis prêt·e, révéler</button>
      </section>`;
  }

  function renderClueGiver() {
    const clueGiver = state.players[state.roundIndex % state.players.length];
    const cluesReady = state.clues.every((c) => c.trim().length > 0);
    const edgesHTML = state.clues.map((c, i) => `
      <input type="text" class="clue-input" data-index="${i}" placeholder="Indice…" value="${esc(c)}" maxlength="40" />`);
    app.innerHTML = `
      <section class="screen screen-cluegiver">
        <h2>${esc(clueGiver)}, donne un indice par paire</h2>
        ${boardHTML(state.round.solutionArrangement, { interactive: false, tileReroll: true }, edgesHTML)}
        <p class="hint">Un mot ne te convient pas ? Touche 🎲 sur sa tuile pour n'en retirer qu'une seule.</p>
        <div class="cluegiver-actions">
          <button class="btn btn-primary btn-large" data-action="validate-clues" ${cluesReady ? '' : 'disabled'}>Indices prêts →</button>
        </div>
      </section>`;
  }

  function renderGuess() {
    const allFilled = state.guess.slots.every((s) => s !== null);
    const cloverArrangement = state.guess.slots.map((s) => (s ? { tile: findTile(state.round, s.tileId), rotation: s.rotation } : null));
    const feedback = state.lastResult ? state.lastResult.perCorner : null;
    const edgesHTML = state.clues.map((c, i) => `<div class="edge-clue"><strong>${CORNER_NAMES[i]}</strong>${esc(c)}${feedback ? (feedback[i] ? ' ✅' : ' ❌') : ''}</div>`);
    app.innerHTML = `
      <section class="screen screen-guess">
        <h2>Manche ${state.roundIndex + 1} : reconstituez le trèfle</h2>
        ${boardHTML(cloverArrangement, { interactive: true, lockedSlots: state.guess.lockedSlots }, edgesHTML)}
        <p class="hint">Glissez une tuile vers une case du trèfle (ou touchez-la puis touchez la case). Les tuiles mal placées reviendront au plateau après vérification.</p>
        ${trayHTML(state.round, state.guess)}
        <button class="btn btn-primary btn-large" data-action="check-guess" ${allFilled ? '' : 'disabled'}>Vérifier la solution</button>
      </section>`;
  }

  function renderResult() {
    app.innerHTML = `
      <section class="screen screen-result">
        <h2>Manche ${state.roundIndex + 1} résolue !</h2>
        <p class="round-score">${state.guess.attempts} essai${state.guess.attempts > 1 ? 's' : ''} — ${state.lastRoundScore} / 4 points</p>
        <p class="total-score">Score total : ${state.totalScore} / ${state.maxScore}</p>
        <button class="btn btn-primary btn-large" data-action="continue-after-result">${state.roundIndex + 1 >= state.players.length ? 'Voir le score final' : 'Manche suivante →'}</button>
      </section>`;
  }

  function renderFinal() {
    const rating = Game.rateScore(state.totalScore, state.maxScore);
    app.innerHTML = `
      <section class="screen screen-final">
        <h2>Partie terminée !</h2>
        <p class="final-emoji">${rating.emoji}</p>
        <p class="final-label">${rating.label}</p>
        <p class="final-score">${state.totalScore} / ${state.maxScore} paires trouvées</p>
        <button class="btn btn-primary btn-large" data-action="replay-same">Rejouer avec les mêmes joueurs</button>
        <button class="btn btn-secondary" data-action="new-game">Nouvelle partie</button>
      </section>`;
  }

  function render() {
    switch (state.screen) {
      case 'setup': return renderSetup();
      case 'transition': return renderTransition();
      case 'cluegiver': return renderClueGiver();
      case 'guess': return renderGuess();
      case 'result': return renderResult();
      case 'final': return renderFinal();
      default: return renderSetup();
    }
  }

  // --- Actions ---

  function addPlayer() {
    if (state.players.length >= MAX_PLAYERS) return;
    state.players.push('');
    render();
  }

  function removePlayer(index) {
    if (state.players.length <= MIN_PLAYERS) return;
    state.players.splice(index, 1);
    render();
  }

  function startGame() {
    const names = state.players.map((n, i) => (n.trim() ? n.trim() : `Joueur ${i + 1}`));
    if (names.length < MIN_PLAYERS || names.length > MAX_PLAYERS) return;
    state.players = names;
    state.roundIndex = 0;
    state.scores = [];
    state.totalScore = 0;
    state.maxScore = 0;
    startRound();
  }

  function startRound() {
    if (state.roundIndex >= state.players.length) {
      finishGame();
      return;
    }
    state.round = Game.generateRound(WORDS);
    state.clues = ['', '', '', ''];
    state.screen = 'transition';
    state.nextScreenAfterTransition = 'cluegiver';
    render();
  }

  function reveal() {
    if (state.nextScreenAfterTransition === 'cluegiver') {
      state.screen = 'cluegiver';
    } else {
      setupGuessPhase();
      state.screen = 'guess';
    }
    render();
  }

  /** Ne concerne qu'une seule tuile (les indices déjà donnés pour ses 2 bords sont réinitialisés). */
  function rerollTileAction(slotIndex) {
    Game.rerollTile(state.round, WORDS, slotIndex);
    SLOT_EDGES[slotIndex].forEach((edgeIndex) => { state.clues[edgeIndex] = ''; });
    render();
  }

  function updateClue(index, value) {
    state.clues[index] = value;
  }

  function validateClues() {
    if (!state.clues.every((c) => c.trim().length > 0)) return;
    state.screen = 'transition';
    state.nextScreenAfterTransition = 'guess';
    render();
  }

  function setupGuessPhase() {
    const rotations = {};
    state.round.tiles.forEach((t) => {
      rotations[t.id] = Math.floor(Math.random() * 4);
    });
    const tray = Game.shuffle(state.round.tiles.map((t) => t.id));
    const trayScatter = {};
    tray.forEach((tileId) => { trayScatter[tileId] = randomScatter(); });
    state.guess = {
      slots: [null, null, null, null],
      tray,
      trayScatter,
      tileRotations: rotations,
      lockedSlots: [false, false, false, false],
      attempts: 0,
    };
    state.selectedTrayTile = null;
    state.lastResult = null;
  }

  /** Petit décalage/rotation aléatoire pour donner un effet de tuiles éparpillées « en vrac ». */
  function randomScatter() {
    return {
      dx: Math.round(Math.random() * 20 - 10),
      dy: Math.round(Math.random() * 16 - 8),
      rot: Math.round(Math.random() * 28 - 14),
    };
  }

  function selectTrayTile(tileId) {
    state.selectedTrayTile = state.selectedTrayTile === tileId ? null : tileId;
    render();
  }

  /** Place une tuile du plateau dans une case (en renvoyant l'occupante éventuelle au plateau, à nouveau « en vrac »). */
  function placeTrayTileInSlot(tileId, slotIndex) {
    if (state.guess.lockedSlots[slotIndex]) return;
    const { slots } = state.guess;
    const rotation = state.guess.tileRotations[tileId] || 0;
    const occupant = slots[slotIndex];
    slots[slotIndex] = { tileId, rotation };
    state.guess.tray = state.guess.tray.filter((id) => id !== tileId);
    if (occupant) {
      state.guess.tray.push(occupant.tileId);
      state.guess.trayScatter[occupant.tileId] = randomScatter();
    }
    state.selectedTrayTile = null;
  }

  /** Échange le contenu de deux cases du trèfle. */
  function swapSlots(indexA, indexB) {
    if (indexA === indexB) return;
    if (state.guess.lockedSlots[indexA] || state.guess.lockedSlots[indexB]) return;
    const { slots } = state.guess;
    const tmp = slots[indexA];
    slots[indexA] = slots[indexB];
    slots[indexB] = tmp;
  }

  /** Renvoie la tuile d'une case vers le plateau, à nouveau « en vrac ». */
  function removeSlotToTray(slotIndex) {
    if (state.guess.lockedSlots[slotIndex]) return;
    const occupant = state.guess.slots[slotIndex];
    if (!occupant) return;
    state.guess.slots[slotIndex] = null;
    state.guess.tray.push(occupant.tileId);
    state.guess.trayScatter[occupant.tileId] = randomScatter();
  }

  function slotClick(slotIndex) {
    if (state.guess.lockedSlots[slotIndex]) return;
    if (state.selectedTrayTile) {
      placeTrayTileInSlot(state.selectedTrayTile, slotIndex);
    } else if (state.guess.slots[slotIndex]) {
      removeSlotToTray(slotIndex);
    }
    render();
  }

  function rotateTray(tileId) {
    state.guess.tileRotations[tileId] = ((state.guess.tileRotations[tileId] || 0) + 1) % 4;
    render();
  }

  function rotateSlot(slotIndex) {
    if (state.guess.lockedSlots[slotIndex]) return;
    const cell = state.guess.slots[slotIndex];
    if (!cell) return;
    cell.rotation = (cell.rotation + 1) % 4;
    state.guess.tileRotations[cell.tileId] = cell.rotation;
    render();
  }

  /**
   * Vérifie la disposition actuelle. Une case est correcte si sa tuile et sa rotation
   * correspondent exactement à la solution pour cette case (indépendamment de ses voisines) :
   * elle est alors verrouillée. Les autres cases sont renvoyées au plateau pour un nouvel essai.
   * Le score de la manche baisse d'un point par essai supplémentaire (plancher 0).
   */
  function checkGuessAction() {
    const arrangement = state.guess.slots.map((s) => {
      if (!s) return null;
      return { tile: findTile(state.round, s.tileId), rotation: s.rotation };
    });
    const result = Game.checkGuess(arrangement, state.round.solutionCorners);
    state.lastResult = result;
    state.guess.attempts += 1;

    const solution = state.round.solutionArrangement;
    const slotOk = [0, 1, 2, 3].map((slotIndex) => {
      const guessCell = state.guess.slots[slotIndex];
      const solutionCell = solution[slotIndex];
      return !!guessCell && guessCell.tileId === solutionCell.tile.id && guessCell.rotation === solutionCell.rotation;
    });
    slotOk.forEach((ok, slotIndex) => {
      if (ok) {
        state.guess.lockedSlots[slotIndex] = true;
      } else if (!state.guess.lockedSlots[slotIndex]) {
        removeSlotToTray(slotIndex);
      }
    });

    if (slotOk.every(Boolean)) {
      const roundScore = Math.max(4 - (state.guess.attempts - 1), 0);
      state.lastRoundScore = roundScore;
      state.scores.push(roundScore);
      state.totalScore += roundScore;
      state.maxScore += 4;
      state.screen = 'result';
    }
    render();
  }

  function continueAfterResult() {
    state.roundIndex += 1;
    startRound();
  }

  function finishGame() {
    state.screen = 'final';
    const ratio = state.maxScore > 0 ? state.totalScore / state.maxScore : 0;
    Storage.saveGameResult({
      date: new Date().toISOString(),
      players: state.players,
      totalScore: state.totalScore,
      maxScore: state.maxScore,
      ratio,
    });
    render();
  }

  function replaySamePlayers() {
    const players = state.players;
    state = freshState();
    state.players = players;
    state.playerCount = players.length;
    startGame();
  }

  function newGame() {
    state = freshState();
    render();
  }

  // --- Glisser-déposer des tuiles (souris + tactile via Pointer Events) ---

  function findDropTarget(x, y) {
    const el = document.elementFromPoint(x, y);
    if (!el) return null;
    const slotEl = el.closest('.clover-cell');
    if (slotEl && app.contains(slotEl)) {
      return { type: 'slot', slotIndex: Number(slotEl.dataset.slot) };
    }
    const trayEl = el.closest('.tray');
    if (trayEl && app.contains(trayEl)) {
      return { type: 'tray' };
    }
    return null;
  }

  function createDragGhost() {
    const tile = findTile(state.round, dragState.tileId);
    const rotation = state.guess.tileRotations[dragState.tileId] || 0;
    const words = Game.wordsAt(tile, rotation);
    const ghost = document.createElement('div');
    ghost.className = 'drag-ghost';
    ghost.style.width = `${dragState.width}px`;
    ghost.style.height = `${dragState.height}px`;
    ghost.innerHTML = tileFaceHTML(words, new Set(), {});
    document.body.appendChild(ghost);
    dragState.ghostEl = ghost;
  }

  function positionDragGhost(x, y) {
    if (!dragState.ghostEl) return;
    dragState.ghostEl.style.left = `${x - dragState.width / 2}px`;
    dragState.ghostEl.style.top = `${y - dragState.height / 2}px`;
  }

  function clearDropHighlight() {
    app.querySelectorAll('.drag-over').forEach((el) => el.classList.remove('drag-over'));
  }

  function highlightDropTarget(x, y) {
    clearDropHighlight();
    const target = findDropTarget(x, y);
    if (target && target.type === 'slot') {
      const el = app.querySelector(`.clover-cell[data-slot="${target.slotIndex}"]`);
      if (el) el.classList.add('drag-over');
    } else if (target && target.type === 'tray') {
      const trayEl = app.querySelector('.tray');
      if (trayEl) trayEl.classList.add('drag-over');
    }
  }

  function performDrop(source, target) {
    if (!target) return;
    if (target.type === 'slot') {
      if (state.guess.lockedSlots[target.slotIndex]) return;
      if (source.type === 'tray') {
        placeTrayTileInSlot(source.tileId, target.slotIndex);
      } else {
        swapSlots(source.slotIndex, target.slotIndex);
      }
    } else if (target.type === 'tray' && source.type === 'slot') {
      removeSlotToTray(source.slotIndex);
    }
  }

  function endDrag() {
    if (dragState) {
      if (dragState.ghostEl) dragState.ghostEl.remove();
      if (dragState.sourceEl) dragState.sourceEl.classList.remove('drag-source');
    }
    clearDropHighlight();
    dragState = null;
  }

  function onPointerDown(e) {
    if (state.screen !== 'guess') return;
    if (e.target.closest('.rotate-btn')) return;
    const trayTileEl = e.target.closest('.tray-tile');
    const slotEl = e.target.closest('.clover-cell');
    let source = null;
    let tileId = null;
    let sourceEl = null;
    if (trayTileEl) {
      tileId = trayTileEl.dataset.tile;
      source = { type: 'tray', tileId };
      sourceEl = trayTileEl;
    } else if (slotEl && !slotEl.classList.contains('empty')) {
      const slotIndex = Number(slotEl.dataset.slot);
      if (state.guess.lockedSlots[slotIndex]) return;
      const cell = state.guess.slots[slotIndex];
      if (!cell) return;
      tileId = cell.tileId;
      source = { type: 'slot', slotIndex };
      sourceEl = slotEl;
    } else {
      return;
    }
    const rect = sourceEl.getBoundingClientRect();
    dragState = {
      pointerId: e.pointerId,
      source,
      tileId,
      sourceEl,
      startX: e.clientX,
      startY: e.clientY,
      width: rect.width,
      height: rect.height,
      moved: false,
      ghostEl: null,
    };
    try { sourceEl.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  }

  function onPointerMove(e) {
    if (!dragState || dragState.pointerId !== e.pointerId) return;
    const dx = e.clientX - dragState.startX;
    const dy = e.clientY - dragState.startY;
    if (!dragState.moved && Math.hypot(dx, dy) > 6) {
      dragState.moved = true;
      dragState.sourceEl.classList.add('drag-source');
      createDragGhost();
    }
    if (dragState.moved) {
      positionDragGhost(e.clientX, e.clientY);
      highlightDropTarget(e.clientX, e.clientY);
    }
  }

  function onPointerUp(e) {
    if (!dragState || dragState.pointerId !== e.pointerId) return;
    const { source, moved } = dragState;
    if (moved) {
      const target = findDropTarget(e.clientX, e.clientY);
      performDrop(source, target);
      endDrag();
      render();
    } else {
      endDrag();
      if (source.type === 'tray') {
        selectTrayTile(source.tileId);
      } else {
        slotClick(source.slotIndex);
      }
    }
  }

  function onPointerCancel(e) {
    if (!dragState || dragState.pointerId !== e.pointerId) return;
    endDrag();
  }

  // --- Event delegation ---

  app.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const action = el.dataset.action;
    switch (action) {
      case 'add-player': return addPlayer();
      case 'remove-player': return removePlayer(Number(el.dataset.index));
      case 'start-game': return startGame();
      case 'toggle-rules': state.rulesOpen = !state.rulesOpen; return render();
      case 'reveal': return reveal();
      case 'reroll-tile': return rerollTileAction(Number(el.dataset.slot));
      case 'validate-clues': return validateClues();
      case 'rotate-tray': e.stopPropagation(); return rotateTray(el.dataset.tile);
      case 'rotate-slot': e.stopPropagation(); return rotateSlot(Number(el.dataset.slot));
      case 'check-guess': return checkGuessAction();
      case 'continue-after-result': return continueAfterResult();
      case 'replay-same': return replaySamePlayers();
      case 'new-game': return newGame();
      default: return;
    }
  });

  app.addEventListener('pointerdown', onPointerDown);
  document.addEventListener('pointermove', onPointerMove);
  document.addEventListener('pointerup', onPointerUp);
  document.addEventListener('pointercancel', onPointerCancel);

  app.addEventListener('input', (e) => {
    if (e.target.classList.contains('player-name')) {
      state.players[Number(e.target.dataset.index)] = e.target.value;
    } else if (e.target.classList.contains('clue-input')) {
      updateClue(Number(e.target.dataset.index), e.target.value);
      const btn = app.querySelector('[data-action="validate-clues"]');
      if (btn) btn.disabled = !state.clues.every((c) => c.trim().length > 0);
    }
  });

  // --- Démarrage ---
  state = freshState();
  render();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('service-worker.js').catch(() => {});
    });
  }
})();

