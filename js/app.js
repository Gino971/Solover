// Contrôleur de l'interface : gère l'état de la partie et le rendu des écrans.
'use strict';

(function () {
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
  const WORD_RE = /^[a-zàâäéèêëïîôöùûüçœæ'-]+$/i;

  // Dictionnaire de base, chargé de façon asynchrone depuis data/words.json au démarrage
  // (voir tout en bas, section "Démarrage") — modifiable directement, ce fichier n'étant que
  // du JSON pur (pas de JS autour à respecter).
  let WORDS = [];

  // Terminaisons de conjugaison assez spécifiques pour repérer un verbe conjugué avec peu
  // de faux positifs (on évite volontairement les terminaisons trop courtes/ambiguës comme
  // "e", "es", "ent" seules, très fréquentes aussi dans des noms/adjectifs).
  const VERB_ENDINGS = [
    'eraient', 'erions', 'eriez', 'erais', 'erait', 'erons', 'erez', 'eront', 'erai', 'eras', 'era',
    'assions', 'assiez', 'assent', 'asses', 'asse',
    'ussions', 'ussiez', 'ussent', 'usses', 'usse',
    'aient', 'ions', 'iez', 'ait', 'ais',
    'èrent', 'âmes', 'âtes', 'îmes', 'îtes', 'irent',
  ];

  function isLikelyConjugatedVerb(word) {
    return VERB_ENDINGS.some((suf) => word.length - suf.length >= 3 && word.endsWith(suf));
  }

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
      guess: { slots: [null, null, null, null], tray: [], trayScatter: {}, tileRotations: {}, lockedSlots: [false, false, false, false], slotSpin: [0, 0, 0, 0], attempts: 0 },
      selectedTrayTile: null,
      selectedSlotTile: null,
      lastResult: null,
      scores: [],
      totalScore: 0,
      maxScore: 0,
      nextScreenAfterTransition: '',
      rulesOpen: false,
      wordsPanelOpen: false,
      wordFilterQuery: '',
      wordFilterStatus: 'custom',
      boardRotation: 0,
    };
  }

  function findTile(round, tileId) {
    return round.tiles.find((t) => t.id === tileId) || null;
  }

  // --- Liste de mots effective (dictionnaire de base + ajouts - retraits) ---

  function normalizeWord(word) {
    const w = String(word || '').trim().toLowerCase();
    if (!w || !WORD_RE.test(w)) return '';
    return w;
  }

  function getWordList() {
    const removed = new Set(Storage.loadRemovedWords ? Storage.loadRemovedWords() : []);
    const custom = Storage.loadCustomWords ? Storage.loadCustomWords() : [];
    const base = WORDS.filter((w) => !removed.has(w));
    custom.forEach((w) => { if (!base.includes(w)) base.push(w); });
    return base;
  }

  /** Construit la liste de mots { word, status } selon le filtre de statut et le texte de recherche. */
  function getFilteredWords() {
    const removed = Storage.loadRemovedWords ? Storage.loadRemovedWords() : [];
    const custom = Storage.loadCustomWords ? Storage.loadCustomWords() : [];
    const removedSet = new Set(removed);
    const status = state.wordFilterStatus;
    let items;
    if (status === 'custom') {
      items = custom.map((w) => ({ word: w, status: 'custom' }));
    } else if (status === 'removed') {
      items = removed.map((w) => ({ word: w, status: 'removed' }));
    } else if (status === 'dictionary') {
      items = WORDS.filter((w) => !removedSet.has(w)).map((w) => ({ word: w, status: 'dictionary' }));
    } else if (status === 'verbs') {
      items = WORDS.filter((w) => !removedSet.has(w) && isLikelyConjugatedVerb(w)).map((w) => ({ word: w, status: 'dictionary' }));
    } else {
      items = WORDS.filter((w) => !removedSet.has(w)).map((w) => ({ word: w, status: 'dictionary' }))
        .concat(custom.map((w) => ({ word: w, status: 'custom' })))
        .concat(removed.map((w) => ({ word: w, status: 'removed' })));
    }
    const query = state.wordFilterQuery.trim().toLowerCase();
    if (query) items = items.filter((it) => it.word.includes(query));
    items.sort((a, b) => a.word.localeCompare(b.word, 'fr'));
    return items;
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
    const slotSpin = opts.slotSpin || [0, 0, 0, 0];
    let cells = '';
    for (let i = 0; i < 4; i++) {
      const cell = arrangement[i];
      const locked = lockedSlots[i];
      if (cell) {
        const words = Game.wordsAt(cell.tile, cell.rotation);
        let centerHTML = '';
        if (locked) {
          centerHTML = '<span class="lock-icon" title="Bonne tuile, verrouillée">🔒</span>';
        } else if (opts.tileReroll) {
          centerHTML = `<button class="tile-center-btn reroll-tile-btn" data-action="reroll-tile" data-slot="${i}" title="Retirer cette tuile et en tirer une autre">🎲</button>`;
        }
        const selected = opts.selectedSlot === i;
        // La case (donc le petit cœur qu'elle porte derrière la tuile) reste visuellement à
        // l'orientation atteinte lors du dernier pivotement, au lieu de revenir à 0° à chaque
        // rendu : sinon le cœur « se remettait droit » juste après avoir tourné avec la tuile.
        const spinStyle = ` style="transform: rotate(${(slotSpin[i] || 0) * 90}deg);"`;
        cells += `<div class="clover-cell slot-${i}${opts.interactive && !locked ? ' clickable' : ''}${locked ? ' locked' : ''}${selected ? ' selected' : ''}" data-slot="${i}"${spinStyle}>
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

  /** Assemble le trèfle avec ses 4 indices/mots positionnés directement sur les bords du plateau.
   * `cornerButtonsHTML` (optionnel) : { home, verify } placés de chaque côté de la pointe basse
   * du cœur (uniquement utilisé sur l'écran de devinette). */
  function boardHTML(arrangement, opts, edgesHTML, cornerButtonsHTML) {
    return `
      <div class="board">
        <div class="edge edge-top">${edgesHTML[0]}</div>
        <div class="edge edge-right">${edgesHTML[1]}</div>
        <div class="edge edge-bottom">${edgesHTML[2]}</div>
        <div class="edge edge-left">${edgesHTML[3]}</div>
        ${cornerButtonsHTML ? `<div class="board-corner board-corner-home">${cornerButtonsHTML.home}</div>` : ''}
        ${cornerButtonsHTML ? `<div class="board-corner board-corner-verify">${cornerButtonsHTML.verify}</div>` : ''}
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
        ${tileFaceHTML(words, new Set(), {})}
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
        <h1>🍀 So lover</h1>
        ${state.wordsLoadError ? '<p class="error-banner">⚠️ Le dictionnaire (data/words.json) n\'a pas pu être chargé. Vérifiez que le fichier existe et que le jeu est servi via un serveur web (pas ouvert directement depuis le disque).</p>' : ''}
        ${best ? `<p class="best-score">Meilleur score : ${best.totalScore}/${best.maxScore} (${Math.round(best.ratio * 100)}%)</p>` : ''}
        <h2>Joueurs (3 à 8)</h2>
        <div class="player-list">${nameInputs}</div>
        <div class="setup-actions">
          <button class="btn btn-secondary" data-action="add-player" ${state.players.length >= MAX_PLAYERS ? 'disabled' : ''}>+ Ajouter un joueur</button>
        </div>
        <button class="btn btn-primary btn-large" data-action="start-game">Commencer la partie</button>
        <button class="btn btn-link" data-action="toggle-rules">📖 Règles du jeu</button>
        ${state.rulesOpen ? renderRules() : ''}
        <button class="btn btn-link" data-action="toggle-words">📝 Gérer les mots</button>
        ${state.wordsPanelOpen ? renderWordsManager() : ''}
      </section>`;

    if (state.wordsPanelOpen) {
      const input = app.querySelector('.word-search');
      if (input) {
        input.focus();
        const v = input.value;
        input.setSelectionRange(v.length, v.length);
      }
    }
  }

  function renderRules() {
    return `
      <div class="rules-box">
        <h3>Règles</h3>
        <p>Un cœur à 4 cases reçoit 4 tuiles tirées au hasard, chacune portant 4 mots (un par face). Sur chacun des 4 bords du plateau, les mots extérieurs de deux tuiles voisines se retrouvent côte à côte : c'est une paire.</p>
        <p>Le donneur d'indices de la manche voit la disposition secrète et propose un indice (un mot ou une courte expression) pour chacune des 4 paires, directement sur le bord concerné.</p>
        <p>Les autres joueurs récupèrent les 4 tuiles (mélangées et retournées au hasard) <strong>+ une 5<sup>e</sup> tuile piège</strong>, et doivent replacer les bonnes tuiles dans le bon sens sur le cœur à l'aide des 4 indices.</p>
        <p>Chaque joueur est donneur d'indices une fois. Le score de l'équipe est le total des paires correctement reconstituées sur toutes les manches.</p>
      </div>`;
  }

  function renderWordsManager() {
    const removed = Storage.loadRemovedWords ? Storage.loadRemovedWords() : [];
    const custom = Storage.loadCustomWords ? Storage.loadCustomWords() : [];
    const rawQuery = state.wordFilterQuery || '';
    const query = normalizeWord(rawQuery);

    let addSuggestionHTML = '';
    if (rawQuery.trim() && !query) {
      addSuggestionHTML = `<p class="word-search-result">Mot invalide (lettres uniquement).</p>`;
    } else if (query && !WORDS.includes(query) && !custom.includes(query) && !removed.includes(query)) {
      addSuggestionHTML = `<p class="word-search-result">« ${esc(query)} » n'existe pas encore.
        <button class="btn btn-secondary" data-action="add-word" data-word="${esc(query)}">+ Ajouter ce mot</button></p>`;
    }

    const filters = [
      { key: 'custom', label: `Ajoutés (${custom.length})` },
      { key: 'dictionary', label: 'Dictionnaire' },
      { key: 'verbs', label: 'Verbes conjugués' },
      { key: 'removed', label: `Retirés (${removed.length})` },
      { key: 'all', label: 'Tous' },
    ];
    const filterButtonsHTML = filters.map((f) => `
      <button class="btn btn-filter ${state.wordFilterStatus === f.key ? 'btn-primary' : 'btn-secondary'}" data-action="set-word-filter" data-filter="${f.key}">${f.label}</button>`).join('');

    const results = getFilteredWords();
    const removableCount = results.filter((it) => it.status === 'dictionary').length;
    const verbsNoticeHTML = state.wordFilterStatus === 'verbs'
      ? `<p class="hint">Détection automatique par terminaisons (imparfait, futur, passé simple…), approximative : vérifiez avant de tout retirer, vous pourrez toujours remettre un mot depuis l'onglet « Retirés ».</p>
         ${removableCount ? `<button class="btn btn-secondary btn-bulk" data-action="exclude-all-filtered">Retirer ces ${removableCount} mots</button>` : ''}`
      : '';
    const rowsHTML = results.length ? results.map((item) => {
      const action = item.status === 'dictionary' ? 'exclude-word' : (item.status === 'custom' ? 'remove-custom-word' : 'restore-word');
      const icon = item.status === 'removed' ? '↺' : '✕';
      const title = item.status === 'removed' ? 'Remettre' : 'Retirer';
      return `<div class="word-cell word-cell--${item.status}">
        <span>${esc(item.word)}</span>
        <button class="word-cell-btn" data-action="${action}" data-word="${esc(item.word)}" title="${title}">${icon}</button>
      </div>`;
    }).join('') : '<p class="hint">Aucun mot ne correspond à ce filtre.</p>';

    const countHTML = `<p class="hint">${results.length} mot${results.length > 1 ? 's' : ''}</p>`;

    return `
      <div class="rules-box words-box">
        <h3>Gérer les mots</h3>
        <p class="hint">Vos ajouts/retraits sont enregistrés dans l'app, mais n'existent pas dans le fichier <code>data/words.json</code> tant que vous ne l'avez pas remplacé.</p>
        <div class="word-export-actions">
          <button class="btn btn-secondary" data-action="export-words">💾 Exporter la liste (words.json)</button>
          ${(custom.length || removed.length) ? `<button class="btn-link" data-action="reset-word-overrides">Effacer mes ajustements (après export)</button>` : ''}
        </div>
        <p class="hint">Filtrez la liste ci-dessous, ou tapez un mot pour l'ajouter s'il n'existe pas encore.</p>
        <div class="word-filters">${filterButtonsHTML}</div>
        <input type="text" class="player-name word-search" placeholder="Filtrer ou ajouter un mot…" value="${esc(rawQuery)}" maxlength="24" />
        ${addSuggestionHTML}
        ${verbsNoticeHTML}
        ${countHTML}
        <div class="word-results">${rowsHTML}</div>
      </div>`;
  }

  /** Barre de navigation affichée en haut des écrans de jeu (accueil), sauf sur l'écran d'accueil lui-même. */
  function navBarHTML() {
    return `<div class="nav-bar"><button class="nav-home" data-action="go-home" title="Retour à l'accueil">🏠 Accueil</button></div>`;
  }

  function renderTransition() {
    const clueGiver = state.players[state.roundIndex % state.players.length];
    const forGuess = state.nextScreenAfterTransition === 'guess';
    app.innerHTML = `
      <section class="screen screen-transition">
        ${navBarHTML()}
        <h2>Manche ${state.roundIndex + 1} / ${state.players.length}</h2>
        ${forGuess
          ? `<p class="transition-text">Passe l'appareil à tout le monde <strong>sauf ${esc(clueGiver)}</strong>.</p>`
          : `<p class="transition-text">Passe l'appareil à <strong>${esc(clueGiver)}</strong>.</p>`}
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
        ${navBarHTML()}
        <h2>${esc(clueGiver)}, donne un indice par paire</h2>
        ${boardHTML(state.round.solutionArrangement, { interactive: false, tileReroll: true }, edgesHTML)}
        <div class="cluegiver-actions">
          <button class="btn btn-primary btn-large" data-action="validate-clues" ${cluesReady ? '' : 'disabled'}>Indices prêts →</button>
        </div>
      </section>`;
  }

  function renderGuess() {
    const allFilled = state.guess.slots.every((s) => s !== null);
    const cloverArrangement = state.guess.slots.map((s) => (s ? { tile: findTile(state.round, s.tileId), rotation: s.rotation } : null));
    const feedback = state.lastResult ? state.lastResult.perCorner : null;
    const edgesHTML = state.clues.map((c, i) => `<div class="edge-clue">${esc(c)}${feedback ? (feedback[i] ? ' ✅' : ' ❌') : ''}</div>`);
    const cornerButtons = {
      home: `<button class="corner-btn corner-btn-home" data-action="go-home" title="Retour à l'accueil">🏠</button>`,
      verify: `<button class="corner-btn corner-btn-verify" data-action="check-guess" ${allFilled ? '' : 'disabled'}>Vérifier</button>`,
    };
    app.innerHTML = `
      <section class="screen screen-guess">
        <h2>Manche ${state.roundIndex + 1} : reconstituez le cœur</h2>
        ${boardHTML(cloverArrangement, { interactive: true, lockedSlots: state.guess.lockedSlots, selectedSlot: state.selectedSlotTile, slotSpin: state.guess.slotSpin }, edgesHTML, cornerButtons)}
        ${trayHTML(state.round, state.guess)}
      </section>`;
  }


  function renderResult() {
    app.innerHTML = `
      <section class="screen screen-result">
        ${navBarHTML()}
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
        ${navBarHTML()}
        <h2>Partie terminée !</h2>
        <p class="final-emoji">${rating.emoji}</p>
        <p class="final-label">${rating.label}</p>
        <p class="final-score">${state.totalScore} / ${state.maxScore} paires trouvées</p>
        <button class="btn btn-primary btn-large" data-action="replay-same">Rejouer avec les mêmes joueurs</button>
        <button class="btn btn-secondary" data-action="new-game">Nouvelle partie</button>
      </section>`;
  }

  function render() {
    applyBoardRotation();
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

  function addWordAction(word) {
    const w = normalizeWord(word);
    if (!w || !Storage.loadCustomWords || !Storage.saveCustomWords) return;
    const custom = Storage.loadCustomWords();
    if (!custom.includes(w)) {
      custom.push(w);
      Storage.saveCustomWords(custom);
    }
    // si le mot avait été retiré du dictionnaire de base, on annule ce retrait
    if (Storage.loadRemovedWords && Storage.saveRemovedWords) {
      const removed = Storage.loadRemovedWords().filter((x) => x !== w);
      Storage.saveRemovedWords(removed);
    }
    state.wordFilterQuery = '';
    render();
  }

  function removeCustomWordAction(word) {
    if (!Storage.loadCustomWords || !Storage.saveCustomWords) return;
    const custom = Storage.loadCustomWords().filter((w) => w !== word);
    Storage.saveCustomWords(custom);
    render();
  }

  function excludeWordAction(word) {
    const w = normalizeWord(word);
    if (!w || !Storage.loadRemovedWords || !Storage.saveRemovedWords) return;
    const removed = Storage.loadRemovedWords();
    if (!removed.includes(w)) {
      removed.push(w);
      Storage.saveRemovedWords(removed);
    }
    render();
  }

  function restoreWordAction(word) {
    if (!Storage.loadRemovedWords || !Storage.saveRemovedWords) return;
    const removed = Storage.loadRemovedWords().filter((w) => w !== word);
    Storage.saveRemovedWords(removed);
    render();
  }

  /** Retire d'un coup tous les mots du dictionnaire actuellement filtrés (ex: tous les verbes conjugués détectés). */
  function excludeAllFilteredAction() {
    if (!Storage.loadRemovedWords || !Storage.saveRemovedWords) return;
    const toRemove = getFilteredWords().filter((it) => it.status === 'dictionary').map((it) => it.word);
    if (!toRemove.length) return;
    const removed = Storage.loadRemovedWords();
    toRemove.forEach((w) => { if (!removed.includes(w)) removed.push(w); });
    Storage.saveRemovedWords(removed);
    render();
  }

  /**
   * Génère un nouveau data/words.json à partir du dictionnaire de base + ajouts - retraits,
   * et déclenche son téléchargement. L'app ne peut pas écrire sur le disque du projet :
   * il faut remplacer manuellement le fichier data/words.json par celui téléchargé.
   */
  function exportWordsAction() {
    const list = Array.from(new Set(getWordList())).sort((a, b) => a.localeCompare(b, 'fr'));
    const body = JSON.stringify(list, null, 2) + '\n';
    const blob = new Blob([body], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'words.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  /** Efface les ajouts/retraits enregistrés dans l'app, une fois qu'ils ont été intégrés au data/words.json exporté. */
  function resetWordOverridesAction() {
    const ok = window.confirm('Effacer les mots ajoutés/retirés enregistrés dans cette app ?\n\nÀ faire seulement après avoir remplacé data/words.json par le fichier exporté, sinon vos ajustements seront perdus.');
    if (!ok) return;
    if (Storage.saveCustomWords) Storage.saveCustomWords([]);
    if (Storage.saveRemovedWords) Storage.saveRemovedWords([]);
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
    state.round = Game.generateRound(getWordList());
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
    Game.rerollTile(state.round, getWordList(), slotIndex);
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
      slotSpin: [0, 0, 0, 0],
      attempts: 0,
    };
    state.selectedTrayTile = null;
    state.selectedSlotTile = null;
    state.lastResult = null;
  }

  /** Petit décalage/rotation aléatoire pour donner un effet de tuiles éparpillées « en vrac ». */
  function randomScatter() {
    return {
      dx: Math.round(Math.random() * 34 - 17),
      dy: Math.round(Math.random() * 26 - 20),
      rot: Math.round(Math.random() * 32 - 16),
    };
  }

  function selectTrayTile(tileId) {
    state.selectedSlotTile = null;
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
    state.selectedSlotTile = null;
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
      // Une tuile du tas est sélectionnée : on la pose ici (échange avec l'occupante éventuelle).
      placeTrayTileInSlot(state.selectedTrayTile, slotIndex);
      render();
      return;
    }
    if (state.selectedSlotTile !== null) {
      if (state.selectedSlotTile === slotIndex) {
        // Un second clic sur la tuile déjà sélectionnée la renvoie dans le tas.
        removeSlotToTray(slotIndex);
        state.selectedSlotTile = null;
      } else {
        // Clic sur une autre case : on déplace/échange la tuile sélectionnée ici.
        if (state.guess.lockedSlots[state.selectedSlotTile]) { state.selectedSlotTile = null; render(); return; }
        swapSlots(state.selectedSlotTile, slotIndex);
        state.selectedSlotTile = null;
      }
      render();
      return;
    }
    if (state.guess.slots[slotIndex]) {
      // Premier clic sur une tuile posée : on la sélectionne, sans la retirer du plateau.
      state.selectedSlotTile = slotIndex;
    }
    render();
  }

  /** Fait pivoter une tuile visuellement (même vitesse/animation que le plateau) avant de
   * mettre à jour le mot affiché sur chaque face — la rotation change le contenu, pas juste
   * l'orientation, donc on ne peut pas se contenter d'une simple rotation CSS continue.
   * `steps` : +1 = un cran vers la droite, -1 = un cran vers la gauche. */
  function spinTileThen(selector, steps, callback) {
    const el = app.querySelector(selector);
    if (!el) {
      callback();
      return;
    }
    el.style.transition = 'transform 0.35s ease';
    el.style.transform = `rotate(${steps * 90}deg)`;
    setTimeout(() => {
      el.style.transition = '';
      el.style.transform = '';
      callback();
    }, 350);
  }

  function rotateTrayBy(tileId, steps) {
    spinTileThen(`.tray-tile[data-tile="${tileId}"] .tile-face`, steps, () => {
      state.guess.tileRotations[tileId] = (((state.guess.tileRotations[tileId] || 0) + steps) % 4 + 4) % 4;
      render();
    });
  }

  /** Recale le compteur d'angle d'une case par multiples de 4 crans (= tours complets), sans
   * jamais changer l'angle visuel affiché (voir normalizeBoardRotation, même principe). */
  function normalizeSlotSpin(v) {
    if (v > 1000) return v - 1000;
    if (v < -1000) return v + 1000;
    return v;
  }

  /** Fait pivoter toute la case (`.clover-cell`) — donc le petit cœur du plateau qu'elle porte
   * derrière la tuile — depuis son angle actuel (persisté via state.guess.slotSpin, jamais remis
   * à zéro) jusqu'à son nouvel angle, pour que le cœur ne « redevienne droit » pas juste après
   * avoir tourné avec la tuile. */
  function rotateSlotBy(slotIndex, steps) {
    if (state.guess.lockedSlots[slotIndex]) return;
    const cell = state.guess.slots[slotIndex];
    if (!cell) return;
    const el = app.querySelector(`.clover-cell[data-slot="${slotIndex}"]`);
    const next = (state.guess.slotSpin[slotIndex] || 0) + steps;
    const finish = () => {
      state.guess.slotSpin[slotIndex] = normalizeSlotSpin(next);
      cell.rotation = ((cell.rotation + steps) % 4 + 4) % 4;
      state.guess.tileRotations[cell.tileId] = cell.rotation;
      render();
    };
    if (!el) {
      finish();
      return;
    }
    el.style.transition = 'transform 0.35s ease';
    el.style.transform = `rotate(${next * 90}deg)`;
    setTimeout(finish, 350);
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

  /** Retour à l'accueil depuis un écran de jeu, avec confirmation si une partie est en cours. */
  function goHomeAction() {
    const midGame = ['transition', 'cluegiver', 'guess', 'result'].includes(state.screen);
    if (midGame) {
      const ok = window.confirm('Quitter la partie en cours et revenir à l\'accueil ?\n\nLa progression de cette partie sera perdue.');
      if (!ok) return;
    }
    newGame();
  }

  /** Fait pivoter tout le plateau (visuel uniquement, la logique de jeu ne change pas). */
  /** Applique la rotation courante à la variable CSS partagée par le cœur et le plateau,
   * sans re-rendu : c'est ce qui permet la transition douce sur des éléments déjà en place. */
  function applyBoardRotation() {
    document.body.style.setProperty('--board-rotation-deg', `${state.boardRotation * 90}deg`);
  }

  /** Recale le compteur de rotation par multiples de 4 crans (= tours complets à 360°) pour
   * qu'il ne grossisse pas indéfiniment, sans jamais changer l'angle visuel affiché : on ne
   * touche donc jamais à la valeur par un modulo direct (ça inverserait le sens de l'animation
   * CSS, ex. passer de 0deg à 270deg au lieu de -90deg -> rotation visuelle de 3/4 de tour). */
  function normalizeBoardRotation() {
    if (state.boardRotation > 1000) state.boardRotation -= 1000;
    if (state.boardRotation < -1000) state.boardRotation += 1000;
  }

  function rotateBoardLeft() {
    state.boardRotation -= 1;
    normalizeBoardRotation();
    applyBoardRotation();
  }

  function rotateBoardRight() {
    state.boardRotation += 1;
    normalizeBoardRotation();
    applyBoardRotation();
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
    state.selectedSlotTile = null;
    state.selectedTrayTile = null;
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

  /** Mémorise le dernier tap par clé (tuile du tas, tuile du plateau, reste du plateau)
   * pour détecter les doubles-taps de manière indépendante. */
  let lastTap = { key: null, time: 0 };
  let pendingTapTimeout = null;

  function registerTapAndCheckDouble(key) {
    const now = Date.now();
    const isDouble = lastTap.key === key && (now - lastTap.time) < 350;
    lastTap = isDouble ? { key: null, time: 0 } : { key, time: now };
    return isDouble;
  }

  function onPointerDown(e) {
    if (state.screen !== 'guess') return;
    if (e.target.closest('.tile-center-btn') || e.target.closest('[data-action]') || e.target.closest('input')) return;
    const trayTileEl = e.target.closest('.tray-tile');
    const slotEl = e.target.closest('.clover-cell');
    const boardEl = e.target.closest('.board');
    let source = null;
    let tileId = null;
    let sourceEl = null;
    if (trayTileEl) {
      tileId = trayTileEl.dataset.tile;
      source = { type: 'tray', tileId };
      sourceEl = trayTileEl;
    } else if (slotEl) {
      const slotIndex = Number(slotEl.dataset.slot);
      if (state.guess.lockedSlots[slotIndex]) return;
      const cell = state.guess.slots[slotIndex];
      if (cell) {
        tileId = cell.tileId;
        source = { type: 'slot', slotIndex };
      } else {
        // Case vide : pas de tuile à faire glisser, mais on suit quand même le tap pour
        // qu'un double-tap ici puisse aussi faire pivoter tout le plateau.
        source = { type: 'slot-empty', slotIndex };
      }
      sourceEl = slotEl;
    } else if (boardEl) {
      // Reste du plateau (bords/indices, espace entre les tuiles) : uniquement pour détecter
      // un double-tap qui fait pivoter tout le plateau.
      source = { type: 'board' };
      sourceEl = boardEl;
    } else {
      return;
    }
    const rect = sourceEl.getBoundingClientRect();
    dragState = {
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
    dragState.pointerId = e.pointerId;
  }

  /** Types de tuile qu'on peut effectivement faire glisser (les cases vides et le reste du
   * plateau ne servent qu'à détecter les taps, pas de glisser-déposer). */
  function isDraggableSource(source) {
    return source.type === 'tray' || source.type === 'slot';
  }

  function onPointerMove(e) {
    if (!dragState || dragState.pointerId !== e.pointerId) return;
    const dx = e.clientX - dragState.startX;
    const dy = e.clientY - dragState.startY;
    if (!dragState.moved && Math.hypot(dx, dy) > 6) {
      dragState.moved = true;
      if (isDraggableSource(dragState.source)) {
        dragState.sourceEl.classList.add('drag-source');
        createDragGhost();
      }
    }
    if (dragState.moved && isDraggableSource(dragState.source)) {
      positionDragGhost(e.clientX, e.clientY);
      highlightDropTarget(e.clientX, e.clientY);
    }
  }

  function onPointerUp(e) {
    if (!dragState || dragState.pointerId !== e.pointerId) return;
    const { source, moved, sourceEl } = dragState;
    if (moved) {
      if (isDraggableSource(source)) {
        const target = findDropTarget(e.clientX, e.clientY);
        performDrop(source, target);
      }
      endDrag();
      render();
      return;
    }

    endDrag();

    if (source.type === 'tray') {
      // Tap simple ou double-tap sur une tuile du tas : la partie droite/gauche détermine
      // le sens de rotation en cas de double-tap ; un tap isolé la sélectionne comme avant.
      const rect = sourceEl.getBoundingClientRect();
      const isRight = (e.clientX - rect.left) > rect.width / 2;
      if (registerTapAndCheckDouble(`tray:${source.tileId}`)) {
        if (pendingTapTimeout) { clearTimeout(pendingTapTimeout); pendingTapTimeout = null; }
        rotateTrayBy(source.tileId, isRight ? 1 : -1);
        return;
      }
      pendingTapTimeout = setTimeout(() => {
        pendingTapTimeout = null;
        selectTrayTile(source.tileId);
      }, 300);
      return;
    }

    // Tuile posée, case vide ou reste du plateau : chacun a son propre historique de tap.
    if (source.type === 'slot') {
      // Tuile posée sur le plateau.
      const rect = sourceEl.getBoundingClientRect();
      const isRight = (e.clientX - rect.left) > rect.width / 2;
      if (registerTapAndCheckDouble(`slot:${source.slotIndex}`)) {
        // Double-tap : faire tourner la tuile (d'un seul quart).
        if (pendingTapTimeout) { clearTimeout(pendingTapTimeout); pendingTapTimeout = null; }
        rotateSlotBy(source.slotIndex, isRight ? 1 : -1);
        return;
      }
      // Tap isolé : sélectionner ou déposter la tuile, selon le contexte.
      pendingTapTimeout = setTimeout(() => {
        pendingTapTimeout = null;
        slotClick(source.slotIndex);
      }, 300);
      return;
    }

    if (source.type === 'slot-empty' || source.type === 'board') {
      // Case vide ou reste du plateau (indices, espace entre les tuiles).
      const boardEl = sourceEl.closest('.board') || sourceEl;
      const boardRect = boardEl.getBoundingClientRect();
      const isRight = (e.clientX - boardRect.left) > boardRect.width / 2;
      if (registerTapAndCheckDouble('board')) {
        // Double-tap : faire tourner TOUT le plateau (d'un seul quart).
        if (pendingTapTimeout) { clearTimeout(pendingTapTimeout); pendingTapTimeout = null; }
        if (isRight) rotateBoardRight(); else rotateBoardLeft();
        return;
      }
      // Tap isolé sur une case vide : clic normal.
      if (source.type === 'slot-empty') {
        pendingTapTimeout = setTimeout(() => {
          pendingTapTimeout = null;
          slotClick(source.slotIndex);
        }, 300);
      }
      // Tap isolé sur le reste du plateau : pas de comportement.
    }
  }

  function onPointerCancel(e) {
    if (!dragState || dragState.pointerId !== e.pointerId) return;
    endDrag();
  }

  /** Double-tap/double-clic sur le plateau, pour les écrans qui ne passent pas par le système
   * de glisser-déposer ci-dessus (ex. l'écran du donneur d'indices, où les tuiles n'ont pas
   * de rotation individuelle) : fait pivoter tout le plateau, moitié droite = vers la droite,
   * moitié gauche = vers la gauche. Sur l'écran de devinette, c'est onPointerUp qui gère déjà
   * ce cas (y compris par-dessus les tuiles), donc on ne fait rien ici pour ne pas déclencher
   * la rotation deux fois.
   */
  app.addEventListener('click', (e) => {
    if (state.screen === 'guess') return;
    if (e.target.closest('[data-action]')) return;
    if (e.target.closest('input')) return;
    const boardEl = e.target.closest('.board');
    if (!boardEl) return;
    if (!registerTapAndCheckDouble('board-click')) return;
    const rect = boardEl.getBoundingClientRect();
    const isRight = (e.clientX - rect.left) > rect.width / 2;
    if (isRight) rotateBoardRight(); else rotateBoardLeft();
  });

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
      case 'toggle-words': state.wordsPanelOpen = !state.wordsPanelOpen; if (!state.wordsPanelOpen) state.wordFilterQuery = ''; return render();
      case 'set-word-filter': state.wordFilterStatus = el.dataset.filter; return render();
      case 'add-word': return addWordAction(el.dataset.word);
      case 'remove-custom-word': return removeCustomWordAction(el.dataset.word);
      case 'exclude-word': return excludeWordAction(el.dataset.word);
      case 'restore-word': return restoreWordAction(el.dataset.word);
      case 'exclude-all-filtered': return excludeAllFilteredAction();
      case 'export-words': return exportWordsAction();
      case 'reset-word-overrides': return resetWordOverridesAction();
      case 'reveal': return reveal();
      case 'reroll-tile': return rerollTileAction(Number(el.dataset.slot));
      case 'validate-clues': return validateClues();
      case 'check-guess': return checkGuessAction();
      case 'continue-after-result': return continueAfterResult();
      case 'replay-same': return replaySamePlayers();
      case 'new-game': return newGame();
      case 'go-home': return goHomeAction();
      default: return;
    }
  });

  // --- Curseurs de pivotement (tuiles et plateau) ---

  const ROTATE_CURSOR_RIGHT = 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\'%3E%3Cpath d=\'M6.5 6.5A8 8 0 1 1 4 12\' fill=\'none\' stroke=\'%232e8b57\' stroke-width=\'2.5\' stroke-linecap=\'round\'/%3E%3Cpath d=\'M4 12 L4 7 L9 9 Z\' fill=\'%232e8b57\'/%3E%3C/svg%3E") 12 12, pointer';
  const ROTATE_CURSOR_LEFT = 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\'%3E%3Cpath d=\'M17.5 6.5A8 8 0 1 0 20 12\' fill=\'none\' stroke=\'%232e8b57\' stroke-width=\'2.5\' stroke-linecap=\'round\'/%3E%3Cpath d=\'M20 12 L20 7 L15 9 Z\' fill=\'%232e8b57\'/%3E%3C/svg%3E") 12 12, pointer';

  /** Survol des zones de pivotement : indique par le curseur le sens de rotation (droite/gauche)
   * qu'un double-clic/double-tap déclenchera à cet endroit, aussi bien sur une tuile individuelle
   * (tas ou plateau, écran de devinette) que sur le plateau entier (écrans avec un plateau). */
  app.addEventListener('mousemove', (e) => {
    const boardEl = e.target.closest('.board');
    if (boardEl && !e.target.closest('.clue-input') && !e.target.closest('[data-action]')) {
      const rect = boardEl.getBoundingClientRect();
      const boardCursor = (e.clientX - rect.left) > rect.width / 2 ? ROTATE_CURSOR_RIGHT : ROTATE_CURSOR_LEFT;
      boardEl.style.cursor = boardCursor;
      // Case vide : pas de tuile à tourner individuellement, donc même curseur que le plateau entier.
      const emptyCell = e.target.closest('.clover-cell.empty');
      if (emptyCell) emptyCell.style.cursor = boardCursor;
    }
    if (state.screen === 'guess') {
      const tileWrap = e.target.closest('.tray-tile, .clover-cell:not(.locked):not(.empty)');
      if (tileWrap) {
        const rect = tileWrap.getBoundingClientRect();
        tileWrap.style.cursor = (e.clientX - rect.left) > rect.width / 2 ? ROTATE_CURSOR_RIGHT : ROTATE_CURSOR_LEFT;
      }
    }
  });

  app.addEventListener('pointerdown', onPointerDown);
  document.addEventListener('pointermove', onPointerMove);
  document.addEventListener('pointerup', onPointerUp);
  document.addEventListener('pointercancel', onPointerCancel);

  app.addEventListener('input', (e) => {
    if (e.target.classList.contains('player-name') && e.target.dataset.index !== undefined) {
      state.players[Number(e.target.dataset.index)] = e.target.value;
    } else if (e.target.classList.contains('clue-input')) {
      updateClue(Number(e.target.dataset.index), e.target.value);
      const btn = app.querySelector('[data-action="validate-clues"]');
      if (btn) btn.disabled = !state.clues.every((c) => c.trim().length > 0);
    } else if (e.target.classList.contains('word-search')) {
      state.wordFilterQuery = e.target.value;
      render();
    }
  });

  // --- Démarrage ---
  // Le dictionnaire est chargé en JSON avant le tout premier rendu : l'écran d'accueil n'a
  // besoin d'aucun mot, donc ce court délai (fichier local, quasi instantané) ne se voit pas.
  let wordsLoadFailed = false;
  fetch('data/words.json')
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .then((data) => {
      if (Array.isArray(data)) WORDS = data;
    })
    .catch((err) => {
      console.error('Impossible de charger data/words.json :', err);
      wordsLoadFailed = true;
    })
    .finally(() => {
      state = freshState();
      if (wordsLoadFailed) state.wordsLoadError = true;
      render();
    });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('service-worker.js').catch(() => {});
    });
  }
})();
