// The ambient life of the city. Traffic cars drive along the roads and
// pedestrians walk the sidewalks. Traffic cars slow down for the car ahead
// and steer around a blockage; pedestrians cross streets, pick new
// destinations when they arrive, and run away when a crime happens nearby.
import { CONFIG } from './config.js';

export function makeTraffic(rng, city, vehicles) {
  const cars = [];
  const peds = [];

  function randomRoadPoint() {
    const road = rng.pick(city.world.roads);
    if (road.vertical) {
      return { x: road.x + road.w / 2, y: rng.float(60, CONFIG.city.height - 60), angle: rng.pick([Math.PI / 2, -Math.PI / 2]) };
    }
    return { x: rng.float(320, CONFIG.city.width - 60), y: road.y + road.h / 2, angle: rng.pick([0, Math.PI]) };
  }

  return {
    cars,
    peds,
    count() {
      return cars.length + peds.length;
    },
    clear() {
      cars.length = 0;
      peds.length = 0;
    },
    spawn() {
      for (let i = 0; i < 12; i++) {
        const spot = randomRoadPoint();
        const car = vehicles.add(rng.pick(['sedan', 'sedan', 'taxi', 'truck']), spot.x, spot.y, spot.angle);
        car.driver = 'traffic';
        car.speed = rng.float(120, 220);
        cars.push(car);
      }
      for (let i = 0; i < 20; i++) {
        const spot = randomRoadPoint();
        peds.push({
          x: spot.x + rng.float(-70, 70),
          y: spot.y + rng.float(-70, 70),
          angle: rng.float(0, Math.PI * 2),
          speed: rng.float(40, 80),
          tx: spot.x,
          ty: spot.y,
          fleeing: false,
        });
      }
    },
    flee(x, y) {
      for (const ped of peds) {
        const d = Math.hypot(ped.x - x, ped.y - y);
        if (d < 240) {
          ped.fleeing = true;
          ped.angle = Math.atan2(ped.y - y, ped.x - x);
          ped.speed = 160;
        }
      }
    },
    update(dt, player) {
      for (const car of cars) {
        if (car.wrecked) continue;
        let blocked = false;
        for (const other of cars) {
          if (other === car || other.wrecked) continue;
          const dx = other.x - car.x;
          const dy = other.y - car.y;
          const d = Math.hypot(dx, dy);
          if (d < 70 && Math.cos(car.angle) * dx + Math.sin(car.angle) * dy > 0) {
            blocked = true;
            break;
          }
        }
        if (blocked) {
          car.speed = Math.max(0, car.speed - 300 * dt);
        } else if (car.speed < 200) {
          car.speed += 120 * dt;
        }
        const nx = car.x + Math.cos(car.angle) * car.speed * dt;
        const ny = car.y + Math.sin(car.angle) * car.speed * dt;
        if (city.hitsBuilding(nx, ny) || city.isWater(nx, ny)) {
          car.angle += Math.PI / 2;
        } else {
          car.x = nx;
          car.y = ny;
        }
        if (car.x < 40 || car.x > CONFIG.city.width - 40 || car.y < 40 || car.y > CONFIG.city.height - 40) {
          car.angle += Math.PI;
          car.x = Math.max(40, Math.min(CONFIG.city.width - 40, car.x));
          car.y = Math.max(40, Math.min(CONFIG.city.height - 40, car.y));
        }
      }
      for (const ped of peds) {
        if (player && player.wanted > 0) {
          const d = Math.hypot(ped.x - player.x, ped.y - player.y);
          if (d < 200 && !ped.fleeing) {
            ped.fleeing = true;
            ped.angle = Math.atan2(ped.y - player.y, ped.x - player.x);
            ped.speed = 160;
          }
        }
        if (ped.fleeing) {
          ped.x += Math.cos(ped.angle) * ped.speed * dt;
          ped.y += Math.sin(ped.angle) * ped.speed * dt;
          if (Math.hypot(ped.x - player.x, ped.y - player.y) > 420) {
            ped.fleeing = false;
            ped.speed = 60;
          }
          continue;
        }
        const dx = ped.tx - ped.x;
        const dy = ped.ty - ped.y;
        const d = Math.hypot(dx, dy);
        if (d < 12) {
          const spot = randomRoadPoint();
          ped.tx = spot.x;
          ped.ty = spot.y;
          continue;
        }
        ped.angle = Math.atan2(dy, dx);
        ped.x += Math.cos(ped.angle) * ped.speed * dt;
        ped.y += Math.sin(ped.angle) * ped.speed * dt;
      }
    },
  };
}
