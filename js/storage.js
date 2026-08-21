// Persistance locale (historique des parties + mots personnalisés) via localStorage.
'use strict';

const STORAGE_KEY = 'trefle-indices:historique';
const CUSTOM_WORDS_KEY = 'trefle-indices:mots-ajoutes';
const REMOVED_WORDS_KEY = 'trefle-indices:mots-retires';

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

// --- Liste de mots personnalisée ---
// Deux listes stockées séparément du dictionnaire (data/words.json, éditable directement) :
// - mots ajoutés par les joueurs (viennent s'ajouter au dictionnaire de base)
// - mots retirés du dictionnaire de base (exclus des parties, sans modifier le fichier source)

function loadWordList(key) {
  try {
    const raw = localStorage.getItem(key);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

function saveWordList(key, list) {
  const clean = Array.from(new Set(list.map((w) => String(w).trim().toLowerCase()).filter(Boolean))).sort();
  try {
    localStorage.setItem(key, JSON.stringify(clean));
  } catch (e) {
    // stockage indisponible (mode privé, quota...) : on ignore silencieusement
  }
  return clean;
}

function loadCustomWords() {
  return loadWordList(CUSTOM_WORDS_KEY);
}

function saveCustomWords(list) {
  return saveWordList(CUSTOM_WORDS_KEY, list);
}

function loadRemovedWords() {
  return loadWordList(REMOVED_WORDS_KEY);
}

function saveRemovedWords(list) {
  return saveWordList(REMOVED_WORDS_KEY, list);
}

if (typeof window !== 'undefined') {
  window.Storage = {
    loadHistory,
    saveGameResult,
    bestScore,
    loadCustomWords,
    saveCustomWords,
    loadRemovedWords,
    saveRemovedWords,
  };
}