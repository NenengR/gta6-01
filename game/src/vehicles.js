// Cars. Defines the car types, spawns parked cars, lets the player steal
// one, drives it with steering and acceleration, damages it on collision
// and removes it when it is wrecked. A car is plain data; this module is
// the only one that moves it.
import { CONFIG } from './config.js';

export const CAR_TYPES = CONFIG.carTypes;

export function typeByName(name) {
  for (const t of CONFIG.carTypes) {
    if (t.name === name) return t;
  }
  return CONFIG.carTypes[0];
}

export function makeVehicles(rng, city) {
  const cars = [];

  function add(typeName, x, y, angle) {
    const type = typeByName(typeName);
    const car = {
      type: type.name,
      topSpeed: type.topSpeed,
      accel: type.accel,
      turn: type.turn,
      color: type.color,
      x,
      y,
      angle,
      speed: 0,
      hp: 100,
      wrecked: false,
      driver: null,
    };
    cars.push(car);
    return car;
  }

  return {
    list: cars,
    add,
    count() {
      return cars.length;
    },
    spawnParked(spawns) {
      for (const s of spawns) {
        const names = ['sedan', 'sedan', 'coupe', 'taxi', 'truck'];
        add(rng.pick(names), s.x, s.y, s.angle);
      }
    },
    nearest(x, y, maxDist) {
      let best = null;
      let bestD = maxDist;
      for (const c of cars) {
        if (c.wrecked) continue;
        const d = Math.hypot(c.x - x, c.y - y);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      return best;
    },
    steal(player, maxDist) {
      const car = this.nearest(player.x, player.y, maxDist);
      if (!car) return null;
      if (player.enterCar(car)) return car;
      return null;
    },
    drive(car, gas, steer, dt) {
      if (car.wrecked) return;
      if (gas > 0) {
        car.speed += car.accel * gas * dt;
      } else if (gas < 0) {
        car.speed -= CONFIG.drive.brake * dt;
        if (car.speed < -CONFIG.drive.reverse) car.speed = -CONFIG.drive.reverse;
      } else {
        car.speed *= Math.max(0, 1 - 1.6 * dt);
        if (Math.abs(car.speed) < 4) car.speed = 0;
      }
      if (car.speed > car.topSpeed) car.speed = car.topSpeed;
      const grip = Math.min(1, Math.abs(car.speed) / 120);
      car.angle += steer * CONFIG.drive.turn * grip * dt * (car.speed >= 0 ? 1 : -1);
      const nx = car.x + Math.cos(car.angle) * car.speed * dt;
      const ny = car.y + Math.sin(car.angle) * car.speed * dt;
      if (city.hitsBuilding(nx, car.y) || city.isWater(nx, car.y)) {
        if (Math.abs(car.speed) > 260) this.damage(car, 18);
        car.speed *= -0.3;
      } else {
        car.x = nx;
      }
      if (city.hitsBuilding(car.x, ny) || city.isWater(car.x, ny)) {
        if (Math.abs(car.speed) > 260) this.damage(car, 18);
        car.speed *= -0.3;
      } else {
        car.y = ny;
      }
    },
    damage(car, n) {
      car.hp -= n;
      if (car.hp <= 0) {
        car.hp = 0;
        car.wrecked = true;
        car.speed = 0;
      }
    },
    removeWrecked() {
      let removed = 0;
      for (let i = cars.length - 1; i >= 0; i--) {
        if (cars[i].wrecked && cars[i].driver !== 'player') {
          cars.splice(i, 1);
          removed++;
        }
      }
      return removed;
    },
    update(dt) {
      for (const c of cars) {
        if (c.driver || c.wrecked) continue;
        if (Math.abs(c.speed) > 1) {
          c.speed *= Math.max(0, 1 - 2 * dt);
          c.x += Math.cos(c.angle) * c.speed * dt;
          c.y += Math.sin(c.angle) * c.speed * dt;
        }
      }
    },
  };
}
