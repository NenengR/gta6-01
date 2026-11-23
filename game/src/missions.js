// The five story missions, in order. Each one names its objective, watches
// the player until it is done, pays the reward and unlocks the next one.
// The first asks for Nia's radio on Lime Street; the later ones ask for a
// getaway drive, a pickup at the docks, losing a three-star chase, and a
// final delivery to the lighthouse. The HUD reads the current mission and
// the message this module keeps.
import { CONFIG } from './config.js';

export function makeMissions(targets) {
  const defs = CONFIG.missions;
  let index = 0;
  let message = '';
  let armed = false;

  function near(player, spot, dist) {
    return Math.hypot(player.x - spot.x, player.y - spot.y) < dist;
  }

  return {
    current() {
      return index < defs.length ? defs[index] : null;
    },
    index() {
      return index;
    },
    done() {
      return index >= defs.length;
    },
    message() {
      return message;
    },
    progress() {
      return index / defs.length;
    },
    reset() {
      index = 0;
      message = '';
      armed = false;
    },
    targetPos() {
      const cur = this.current();
      if (!cur) return null;
      if (cur.target === 'lime') return targets.lime;
      if (cur.target === 'docks') return targets.docks;
      if (cur.target === 'lighthouse') return targets.lighthouse;
      return null;
    },
    complete(player) {
      const cur = this.current();
      if (!cur) return false;
      player.earn(cur.reward);
      message = 'Mission complete: ' + cur.name + ' +$' + cur.reward;
      index++;
      armed = false;
      if (index >= defs.length) {
        message = 'All missions complete. Sunbreak is yours.';
      } else {
        message += ' Next: ' + defs[index].name + '.';
      }
      return true;
    },
    update(dt, player, keys) {
      const cur = this.current();
      if (!cur) return false;
      if (cur.id === 1) {
        if (near(player, targets.lime, 60) && keys.interact) return this.complete(player);
      } else if (cur.id === 2) {
        if (!player.onFoot && near(player, targets.docks, 80)) return this.complete(player);
      } else if (cur.id === 3) {
        if (near(player, targets.docks, 60) && keys.interact) return this.complete(player);
      } else if (cur.id === 4) {
        if (player.wanted >= 3) armed = true;
        if (armed && player.wanted === 0) return this.complete(player);
      } else if (cur.id === 5) {
        if (near(player, targets.lighthouse, 60) && keys.interact) return this.complete(player);
      }
      return false;
    },
  };
}
