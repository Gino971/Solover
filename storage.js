// Persistance locale (historique des parties) via localStorage.
'use strict';

const STORAGE_KEY = 'trefle-indices:historique';

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

if (typeof window !== 'undefined') {
  window.Storage = { loadHistory, saveGameResult, bestScore };
}

