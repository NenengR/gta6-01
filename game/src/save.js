const SAVE_KEY = "sunbreak-coastline-save-v1";

export function saveGame(state) {
  try {
    const data = {
      version: 1,
      savedAt: Date.now(),
      player: {
        x: state.player.x,
        y: state.player.y,
        angle: state.player.angle,
        health: state.player.health,
        cash: state.player.cash,
        vehicleId: state.player.vehicle?.id || null,
      },
      combat: {
        magazine: state.combat.magazine,
        reserveAmmo: state.combat.reserveAmmo,
      },
      police: {
        heat: state.police.heat,
        wanted: state.police.wanted,
      },
      missions: {
        completed: state.missions.completed,
        availableIndex: state.missions.availableIndex,
        active: state.missions.active ? { ...state.missions.active } : null,
      },
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== 1 || !data.player) return null;
    return data;
  } catch {
    return null;
  }
}

export function hasSaveGame() {
  try {
    return Boolean(localStorage.getItem(SAVE_KEY));
  } catch {
    return false;
  }
}

export function clearSaveGame() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // Storage can be disabled in private browsing; the game remains playable.
  }
}
