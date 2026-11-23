// The player character. Holds position, facing, health, money and the
// wanted level, and knows whether it is on foot or driving. It walks with
// the movement keys, steps into a nearby car, steps out again, takes
// damage, heals, earns and spends money, and raises or lowers its wanted
// level. The wanted level fades slowly while the player stays hidden.
import { CONFIG } from './config.js';

export function makePlayer(spawn) {
  const p = {
    x: spawn.x,
    y: spawn.y,
    angle: 0,
    health: CONFIG.start.health,
    money: CONFIG.start.money,
    wanted: 0,
    onFoot: true,
    car: null,
    speed: 0,
    radius: 14,
  };

  function moveAxis(dx, dy, city) {
    const nx = p.x + dx;
    const ny = p.y + dy;
    if (!city.hitsBuilding(nx, p.y) && !city.isWater(nx, p.y)) p.x = nx;
    if (!city.hitsBuilding(p.x, ny) && !city.isWater(p.x, ny)) p.y = ny;
  }

  return {
    get x() { return p.x; },
    get y() { return p.y; },
    get angle() { return p.angle; },
    get health() { return p.health; },
    get money() { return p.money; },
    get wanted() { return p.wanted; },
    get onFoot() { return p.onFoot; },
    get car() { return p.car; },
    get radius() { return p.radius; },
    isAlive() {
      return p.health > 0;
    },
    reset(spawn) {
      p.x = spawn.x;
      p.y = spawn.y;
      p.angle = 0;
      p.health = CONFIG.start.health;
      p.money = CONFIG.start.money;
      p.wanted = 0;
      p.onFoot = true;
      p.car = null;
      p.speed = 0;
    },
    walk(ix, iy, dt, city, running) {
      const len = Math.hypot(ix, iy);
      if (len < 0.01) {
        p.speed = 0;
        return;
      }
      const sp = (running ? CONFIG.walk.runSpeed : CONFIG.walk.speed) * dt;
      const nx = (ix / len) * sp;
      const ny = (iy / len) * sp;
      p.angle = Math.atan2(iy, ix);
      p.speed = sp / dt;
      moveAxis(nx, ny, city);
    },
    enterCar(car) {
      if (!car || car.wrecked) return false;
      const d = Math.hypot(car.x - p.x, car.y - p.y);
      if (d > 70) return false;
      p.onFoot = false;
      p.car = car;
      car.driver = 'player';
      return true;
    },
    exitCar() {
      if (p.onFoot || !p.car) return false;
      const car = p.car;
      car.driver = null;
      p.car = null;
      p.onFoot = true;
      p.x = car.x + Math.cos(car.angle + Math.PI / 2) * 40;
      p.y = car.y + Math.sin(car.angle + Math.PI / 2) * 40;
      p.angle = car.angle;
      return true;
    },
    damage(n) {
      p.health = Math.max(0, p.health - n);
      return p.health > 0;
    },
    heal(n) {
      p.health = Math.min(100, p.health + n);
    },
    earn(n) {
      p.money += n;
    },
    spend(n) {
      if (p.money < n) return false;
      p.money -= n;
      return true;
    },
    raiseWanted(n) {
      p.wanted = Math.min(5, p.wanted + n);
    },
    lowerWanted(n) {
      p.wanted = Math.max(0, p.wanted - n);
    },
    setWanted(n) {
      p.wanted = Math.max(0, Math.min(5, n));
    },
    update(dt, hidden) {
      if (hidden && p.wanted > 0 && Number.isFinite(dt)) {
        p.wanted = Math.max(0, p.wanted - CONFIG.wanted.decay * dt);
      }
      if (!p.onFoot && p.car) {
        p.x = p.car.x;
        p.y = p.car.y;
        p.angle = p.car.angle;
      }
    },
  };
}
