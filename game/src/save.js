// Saving and loading. Progress, money, completed missions, settings and
// the best score are stored in the browser's local storage and loaded on
// start. Everything is guarded, so a missing or broken save simply means
// a fresh game instead of a crash.
const KEY = 'sunbreak-coastline-save-v1';

export function saveGame(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

export function hasSave() {
  try {
    return localStorage.getItem(KEY) !== null;
  } catch (e) {
    return false;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(KEY);
    return true;
  } catch (e) {
    return false;
  }
}

export function saveBest(score) {
  try {
    const prev = loadBest();
    if (prev !== null && prev >= score) return prev;
    localStorage.setItem(KEY + '-best', String(score));
    return score;
  } catch (e) {
    return score;
  }
}

export function loadBest() {
  try {
    const raw = localStorage.getItem(KEY + '-best');
    if (raw === null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch (e) {
    return null;
  }
}
