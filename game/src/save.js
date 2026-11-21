const SAVE_KEY = "sunbreak-coastline-save-v1";

export function saveGame(state) {
  if (!Number.isFinite(state.player.health) || state.player.health <= 0 || state.police.busted) return false;
  try {
    const data = {
      version: 2,
      seed: state.seed,
      savedAt: Date.now(),
      player: {
        x: state.player.x,
        y: state.player.y,
        angle: state.player.angle,
        health: state.player.health,
        cash: state.player.cash,
        vehicleId: state.player.vehicle?.id || null,
      },
      vehicles: state.traffic.cars.map((car) => ({
        id: car.id, x: car.x, y: car.y, angle: car.angle,
        health: car.health, vx: car.vx, vy: car.vy, stolen: car.stolen === true,
      })),
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
    if (!data || data.version !== 2 || !Number.isInteger(data.seed) || !data.player
        || !Number.isFinite(data.player.health) || data.player.health <= 0
        || !Number.isFinite(data.player.x) || !Number.isFinite(data.player.y)) return null;
    return data;
  } catch {
    return null;
  }
}

export function hasSaveGame() {
  try {
    return loadGame() !== null;
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
