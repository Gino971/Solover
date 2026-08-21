// Logique pure du jeu : génération des manches, rotation des tuiles, calcul des scores.
// Aucune manipulation du DOM ici.
'use strict';

const CLOVER_SLOTS = 4; // trèfle à 4 cases
const TILE_SIDES = 4; // 4 mots par tuile (un par face)
const TILES_PER_ROUND = CLOVER_SLOTS + 1; // 4 tuiles utilisées + 1 tuile piège

function shuffle(array) {
  const a = array.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Tire N mots distincts au hasard dans le dictionnaire. */
function pickRandomWords(count, dictionary) {
  if (count > dictionary.length) {
    throw new Error('Dictionnaire trop petit pour ce tirage');
  }
  const indices = new Set();
  while (indices.size < count) {
    indices.add(Math.floor(Math.random() * dictionary.length));
  }
  return Array.from(indices).map((i) => dictionary[i]);
}

/**
 * Renvoie les 4 mots affichés (Haut/Droite/Bas/Gauche) d'une tuile selon sa rotation.
 * `tile.words` est l'ordre cyclique fixe [Haut,Droite,Bas,Gauche] à la rotation 0.
 * Une rotation `r` (0-3) fait pivoter la tuile de r * 90° dans le sens horaire.
 */
function wordsAt(tile, rotation) {
  const w = tile.words;
  const r = ((rotation % TILE_SIDES) + TILE_SIDES) % TILE_SIDES;
  const at = (i) => w[(i - r + TILE_SIDES) % TILE_SIDES];
  return { T: at(0), R: at(1), B: at(2), L: at(3) };
}

/**
 * Les 4 bords du plateau (Haut/Droite/Bas/Gauche). Chaque bord associe le mot
 * extérieur (tourné vers le bord du plateau, pas vers le centre) de deux tuiles
 * voisines : c'est cette paire que le donneur d'indices doit faire deviner.
 * (slot0=haut-gauche, slot1=haut-droite, slot2=bas-droite, slot3=bas-gauche).
 */
const BOARD_EDGES = [
  { name: 'Haut', a: { slot: 0, side: 'T' }, b: { slot: 1, side: 'T' } },
  { name: 'Droite', a: { slot: 1, side: 'R' }, b: { slot: 2, side: 'R' } },
  { name: 'Bas', a: { slot: 2, side: 'B' }, b: { slot: 3, side: 'B' } },
  { name: 'Gauche', a: { slot: 3, side: 'L' }, b: { slot: 0, side: 'L' } },
];

/** Calcule les 4 paires de mots formées sur les bords du trèfle (voir BOARD_EDGES). */
function computeCorners(arrangement) {
  const faces = arrangement.map((cell) => (cell ? wordsAt(cell.tile, cell.rotation) : null));
  return BOARD_EDGES.map(({ a, b }) => {
    const faceA = faces[a.slot];
    const faceB = faces[b.slot];
    if (!faceA || !faceB) return null;
    return [faceA[a.side], faceB[b.side]];
  });
}

function sameUnorderedPair(a, b) {
  if (!a || !b) return false;
  return (a[0] === b[0] && a[1] === b[1]) || (a[0] === b[1] && a[1] === b[0]);
}

/** Génère une nouvelle manche : 5 tuiles, une disposition-solution et les indices attendus. */
function generateRound(dictionary) {
  const words = pickRandomWords(TILES_PER_ROUND * TILE_SIDES, dictionary);
  const tiles = [];
  for (let t = 0; t < TILES_PER_ROUND; t++) {
    tiles.push({
      id: `t${t}-${Math.random().toString(36).slice(2, 8)}`,
      words: words.slice(t * TILE_SIDES, (t + 1) * TILE_SIDES),
    });
  }
  const order = shuffle(tiles);
  const placed = order.slice(0, CLOVER_SLOTS);
  const decoy = order[CLOVER_SLOTS];
  const rotations = placed.map(() => Math.floor(Math.random() * TILE_SIDES));
  const solutionArrangement = placed.map((tile, i) => ({ tile, rotation: rotations[i] }));
  const solutionCorners = computeCorners(solutionArrangement);

  return {
    tiles, // les 5 tuiles de la manche (dans l'ordre de tirage, non mélangé pour le plateau)
    solutionArrangement, // ce que voit le donneur d'indices
    solutionCorners, // les 4 paires de mots correspondantes
    decoyTile: decoy,
  };
}

/** Compare une disposition proposée par les devineurs à la solution. */
function checkGuess(guessArrangement, solutionCorners) {
  const guessCorners = computeCorners(guessArrangement);
  const perCorner = guessCorners.map((pair, i) => sameUnorderedPair(pair, solutionCorners[i]));
  const matches = perCorner.filter(Boolean).length;
  return { perCorner, matches, guessCorners };
}

/**
 * Retire la tuile d'une case de la solution et la remplace par une tuile neuve
 * (4 mots inédits dans la manche). Ne concerne qu'une seule tuile à la fois,
 * utile quand un mot tiré semble impropre au jeu. Mute `round` en place.
 */
function rerollTile(round, dictionary, slotIndex) {
  const usedWords = new Set();
  round.tiles.forEach((t) => t.words.forEach((w) => usedWords.add(w)));
  const newWords = [];
  while (newWords.length < TILE_SIDES) {
    const candidate = dictionary[Math.floor(Math.random() * dictionary.length)];
    if (!usedWords.has(candidate)) {
      newWords.push(candidate);
      usedWords.add(candidate);
    }
  }
  const newTile = { id: `r-${Math.random().toString(36).slice(2, 8)}`, words: newWords };
  const oldTileId = round.solutionArrangement[slotIndex].tile.id;
  const tileArrIndex = round.tiles.findIndex((t) => t.id === oldTileId);
  if (tileArrIndex !== -1) round.tiles[tileArrIndex] = newTile;
  round.solutionArrangement[slotIndex] = { tile: newTile, rotation: Math.floor(Math.random() * TILE_SIDES) };
  round.solutionCorners = computeCorners(round.solutionArrangement);
}

const RATING_TABLE = [
  { min: 0, label: 'Trèfle fané', emoji: '🍂' },
  { min: 0.4, label: 'Trèfle qui pousse', emoji: '🌱' },
  { min: 0.6, label: 'Trèfle porte-bonheur', emoji: '🍀' },
  { min: 0.8, label: 'Trèfle en or', emoji: '✨' },
  { min: 1.0, label: 'Trèfle légendaire', emoji: '🏆' },
];

function rateScore(totalScore, maxScore) {
  const ratio = maxScore > 0 ? totalScore / maxScore : 0;
  let best = RATING_TABLE[0];
  for (const entry of RATING_TABLE) {
    if (ratio >= entry.min) best = entry;
  }
  return best;
}

if (typeof module !== 'undefined') {
  module.exports = {
    CLOVER_SLOTS,
    TILE_SIDES,
    TILES_PER_ROUND,
    BOARD_EDGES,
    shuffle,
    pickRandomWords,
    wordsAt,
    computeCorners,
    generateRound,
    checkGuess,
    rerollTile,
    rateScore,
  };
}
if (typeof window !== 'undefined') {
  window.Game = {
    CLOVER_SLOTS,
    TILE_SIDES,
    TILES_PER_ROUND,
    BOARD_EDGES,
    shuffle,
    pickRandomWords,
    wordsAt,
    computeCorners,
    generateRound,
    checkGuess,
    rerollTile,
    rateScore,
  };
}
