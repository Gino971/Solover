// Persistance locale (historique des parties + cartes personnalisées) via localStorage.
'use strict';

const STORAGE_KEY = 'trefle-indices:historique';
const CUSTOM_CARDS_KEY = 'trefle-indices:cartes-ajoutees';
const REMOVED_CARDS_KEY = 'trefle-indices:cartes-retires';

function loadHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveGameResult(result) {
  const history = loadHistory();
  history.unshift(result);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(0, 20)));
  } catch (e) {
    // stockage indisponible (mode privé, quota...) : on ignore silencieusement
  }
}

function bestScore() {
  const history = loadHistory();
  if (history.length === 0) return null;
  return history.reduce((best, g) => (g.ratio > best.ratio ? g : best), history[0]);
}

// --- Liste de cartes personnalisée ---
// Deux listes stockées séparément du dictionnaire (data/<fichier>.json, éditable directement) :
// - cartes ajoutées par les joueurs (viennent s'ajouter au dictionnaire de base)
// - cartes retirées du dictionnaire de base (exclus des parties, sans modifier le fichier source)

function storageKey(baseKey, file) {
  return `${baseKey}:${encodeURIComponent(file || '')}`;
}

function cleanCard(card) {
  if (!Array.isArray(card)) return [];
  return card.map((word) => String(word || '').trim()).filter(Boolean).slice(0, 4);
}

function cardSignature(card) {
  return cleanCard(card).map((word) => word.toLowerCase()).join('\u0001');
}

function loadCardList(key) {
  try {
    const raw = localStorage.getItem(key);
    const list = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return [];
    const seen = new Set();
    const clean = [];
    list.forEach((card) => {
      const normalized = cleanCard(card);
      if (normalized.length !== 4) return;
      const signature = cardSignature(normalized);
      if (seen.has(signature)) return;
      seen.add(signature);
      clean.push(normalized);
    });
    return clean;
  } catch (e) {
    return [];
  }
}

function saveCardList(key, list) {
  const seen = new Set();
  const clean = [];
  (Array.isArray(list) ? list : []).forEach((card) => {
    const normalized = cleanCard(card);
    if (normalized.length !== 4) return;
    const signature = cardSignature(normalized);
    if (seen.has(signature)) return;
    seen.add(signature);
    clean.push(normalized);
  });
  try {
    localStorage.setItem(key, JSON.stringify(clean));
  } catch (e) {
    // stockage indisponible (mode privé, quota...) : on ignore silencieusement
  }
  return clean;
}

function loadCustomCards(file) {
  return loadCardList(storageKey(CUSTOM_CARDS_KEY, file));
}

function saveCustomCards(file, list) {
  return saveCardList(storageKey(CUSTOM_CARDS_KEY, file), list);
}

function loadRemovedCards(file) {
  return loadCardList(storageKey(REMOVED_CARDS_KEY, file));
}

function saveRemovedCards(file, list) {
  return saveCardList(storageKey(REMOVED_CARDS_KEY, file), list);
}

// Aliases conservés pour compatibilité avec les anciens appels.
function loadCustomWords(file) {
  return loadCustomCards(file);
}

function saveCustomWords(file, list) {
  return saveCustomCards(file, list);
}

function loadRemovedWords(file) {
  return loadRemovedCards(file);
}

function saveRemovedWords(file, list) {
  return saveRemovedCards(file, list);
}

// --- Dictionnaire sélectionné (nom de fichier dans data/) ---

const SELECTED_DICTIONARY_KEY = 'trefle-indices:dictionnaire';

function loadSelectedDictionary() {
  try {
    return localStorage.getItem(SELECTED_DICTIONARY_KEY) || '';
  } catch (e) {
    return '';
  }
}

function saveSelectedDictionary(file) {
  try {
    localStorage.setItem(SELECTED_DICTIONARY_KEY, file);
  } catch (e) {
    // stockage indisponible (mode privé, quota...) : on ignore silencieusement
  }
}

if (typeof window !== 'undefined') {
  window.Storage = {
    loadHistory,
    saveGameResult,
    bestScore,
    loadCustomCards,
    saveCustomCards,
    loadRemovedCards,
    saveRemovedCards,
    loadCustomWords,
    saveCustomWords,
    loadRemovedWords,
    saveRemovedWords,
    loadSelectedDictionary,
    saveSelectedDictionary,
  };
}