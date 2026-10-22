// 行為計算獨立於畫面：位置與濕度都是示意單位，沒有指定生物實際尺寸。
export const bounds = { x: 9.5, z: 6.5 };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export function seededRandom(seed = 415) {
  return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
}

export function createWorld(seed = 415) {
  const random = seededRandom(seed);
  const sources = [{ x: 3.2, z: 1.5, radius: 2.6 }, { x: -3.8, z: -3.8, radius: 2.1 }];
  const world = {
    sources, stones: [], random, time: 0, picked: 0, released: 0, absorbed: 0,
    agent: { x: -4.4, z: 1.2, angle: 0.3, turn: 0, speed: 0, distance: 0, noise: 0, left: 0, right: 0 },
    settings: { sensing: true, sensitivity: 9, irregularity: 0.11, speed: 0.48 },
    event: '前緣收進碎石，後緣放回地面',
  };
  for (let i = 0; i < 3900; i++) {
    const stone = {
      id: i, x: (random() * 2 - 1) * bounds.x, z: (random() * 2 - 1) * bounds.z,
      size: i < 1480 ? 0.15 + random() * 0.13 : 0.055 + random() * 0.095, rotation: random() * Math.PI * 2,
      shape: 0.7 + random() * 0.5, shade: random(), carrier: null, grab: null, drop: null, patch: -1, water: 0,
    };
    // 吸水建材集中在兩個較濕區；每塊都有有限儲水，取完後不自動補滿。
    for (let p = 0; p < sources.length; p++) {
      const source = sources[p];
      if (Math.hypot(stone.x - source.x, stone.z - source.z) < source.radius && random() < 0.62) {
        stone.patch = p;
        stone.water = 0.7 + random() * 0.6;
        break;
      }
    }
    if (i < 16) {
      stone.patch = -1; stone.water = 0;
      stone.carrier = { progress: (i + 0.5) / 16, side: ((i * 0.618) % 1 - 0.5) * 0.98, initialWater: 0, taken: 0 };
    }
    world.stones.push(stone);
  }
  // 可見地面仍然潮濕；濕區影響強度的消退只是實驗用的抽象規則。
  updateSourceStrength(world);
  updateSensors(world);
  return world;
}

function updateSourceStrength(world) {
  for (let p = 0; p < world.sources.length; p++) {
    const stones = world.stones.filter(s => s.patch === p);
    const remaining = stones.reduce((sum, s) => sum + s.water, 0);
    if (world.sources[p].initialWater === undefined) world.sources[p].initialWater = remaining || 1;
    world.sources[p].strength = 0.18 + 0.82 * remaining / world.sources[p].initialWater;
  }
}

export function humidityAt(world, x, z) {
  let value = 0.38;
  for (const source of world.sources) {
    const r2 = (x - source.x) ** 2 + (z - source.z) ** 2;
    value += 0.46 * (source.strength ?? 1) * Math.exp(-r2 / (2 * source.radius ** 2));
  }
  return clamp(value, 0, 1);
}

export function sensorPositions(agent) {
  const f = { x: Math.cos(agent.angle), z: Math.sin(agent.angle) };
  const l = { x: -f.z, z: f.x };
  return {
    left: { x: agent.x + f.x * 0.45 + l.x * 0.46, z: agent.z + f.z * 0.45 + l.z * 0.46 },
    right: { x: agent.x + f.x * 0.45 - l.x * 0.46, z: agent.z + f.z * 0.45 - l.z * 0.46 },
  };
}

function updateSensors(world) {
  const points = sensorPositions(world.agent);
  world.agent.left = humidityAt(world, points.left.x, points.left.z);
  world.agent.right = humidityAt(world, points.right.x, points.right.z);
}

export function stonePosition(world, stone) {
  if (stone.drop) {
    const p = clamp(stone.drop.age / stone.drop.landTime, 0, 1);
    const smooth = p * p * (3 - 2 * p);
    const { from, to } = stone.drop;
    return {
      x: from.x + (to.x - from.x) * smooth,
      z: from.z + (to.z - from.z) * smooth,
      y: from.y + (0.065 - from.y) * smooth + Math.sin(p * Math.PI) * 0.055,
    };
  }
  if (stone.grab) {
    const pull = clamp((stone.grab.age / stone.grab.duration - 0.42) / 0.58, 0, 1);
    const smooth = pull * pull * (3 - 2 * pull);
    const a = world.agent, side = stone.grab.side;
    const targetX = a.x + Math.cos(a.angle) * 0.89 - Math.sin(a.angle) * side;
    const targetZ = a.z + Math.sin(a.angle) * 0.89 + Math.cos(a.angle) * side;
    return {
      x: stone.x + (targetX - stone.x) * smooth,
      z: stone.z + (targetZ - stone.z) * smooth,
      y: 0.065 + 0.055 * smooth + Math.sin(pull * Math.PI) * 0.075,
    };
  }
  if (!stone.carrier) return { x: stone.x, y: 0.065, z: stone.z };
  const { agent } = world;
  const front = 0.89 - 1.78 * stone.carrier.progress;
  const side = stone.carrier.side;
  return {
    x: agent.x + Math.cos(agent.angle) * front - Math.sin(agent.angle) * side,
    z: agent.z + Math.sin(agent.angle) * front + Math.cos(agent.angle) * side,
    y: 0.12 + Math.sin(stone.carrier.progress * Math.PI) * 0.018,
  };
}

export function moveSource(world, index, x, z) {
  const source = world.sources[index];
  const nextX = clamp(x, -bounds.x + 2.2, bounds.x - 2.2);
  const nextZ = clamp(z, -bounds.z + 2.2, bounds.z - 2.2);
  for (const stone of world.stones) {
    if (stone.patch !== index || stone.carrier || stone.grab || stone.drop) continue;
    stone.x = clamp(stone.x + nextX - source.x, -bounds.x, bounds.x);
    stone.z = clamp(stone.z + nextZ - source.z, -bounds.z, bounds.z);
  }
  source.x = nextX; source.z = nextZ;
  updateSensors(world);
}

export function stepWorld(world, dt) {
  if (!(dt > 0)) return;
  dt = Math.min(dt, 0.05);
  const a = world.agent, settings = world.settings;
  world.time += dt;
  updateSensors(world);
  // Braitenberg：同側濕度越高，等效同側驅動越小，左右差使身體轉向較濕處。
  // 這只是轉向計算，沒有替生物新增輪子或決定器官外形。
  const leftDrive = 1 - 0.6 * a.left;
  const rightDrive = 1 - 0.6 * a.right;
  a.noise += (-a.noise * 1.7) * dt + (world.random() * 2 - 1) * Math.sqrt(dt) * 0.7;
  let targetTurn = (settings.sensing ? settings.sensitivity * (rightDrive - leftDrive) : 0)
    + settings.irregularity * a.noise;
  // 觀察區邊緣導回：展示範圍限制，不宣稱是生物感知器官。
  const nx = a.x / (bounds.x - 1), nz = a.z / (bounds.z - 1);
  const bx = Math.abs(nx) > 0.88 ? -Math.sign(nx) * (Math.abs(nx) - 0.88) * 6 : 0;
  const bz = Math.abs(nz) > 0.88 ? -Math.sign(nz) * (Math.abs(nz) - 0.88) * 6 : 0;
  targetTurn += clamp(Math.cos(a.angle) * bz - Math.sin(a.angle) * bx, -0.8, 0.8);
  targetTurn = clamp(targetTurn, -0.8, 0.8);
  a.turn += clamp(targetTurn - a.turn, -dt * 0.8, dt * 0.8);
  a.angle += a.turn * dt;
  // 保留基礎速度，使牠在濕區仍慢慢移動，不會強制停在建材前。
  a.speed = settings.speed * (settings.sensing ? (leftDrive + rightDrive) / 2 : 0.7);
  const distance = a.speed * dt;
  a.x = clamp(a.x + Math.cos(a.angle) * distance, -bounds.x + 0.9, bounds.x - 0.9);
  a.z = clamp(a.z + Math.sin(a.angle) * distance, -bounds.z + 0.9, bounds.z - 0.9);
  a.distance += distance;
  const forward = { x: Math.cos(a.angle), z: Math.sin(a.angle) };
  let attached = world.stones.reduce((n, s) => n + Boolean(s.carrier), 0);
  let reaching = world.stones.reduce((n, s) => n + Boolean(s.grab), 0);
  for (const stone of world.stones) {
    if (stone.drop) {
      stone.drop.age += dt;
      if (stone.drop.age >= stone.drop.landTime && stone.carrier) {
        stone.x = stone.drop.to.x; stone.z = stone.drop.to.z;
        stone.carrier = null; world.released++; attached--;
        world.event = '後方觸手放好碎石，鬆開並收回';
      }
      if (stone.drop.age >= stone.drop.duration) stone.drop = null;
      continue;
    }
    if (!stone.carrier) {
      if (stone.grab) {
        stone.grab.age += dt;
        if (stone.grab.age >= stone.grab.duration) {
          stone.carrier = { progress: 0, side: stone.grab.side, initialWater: stone.water, taken: 0 };
          stone.grab = null; world.picked++; attached++; reaching--;
          world.event = stone.water > 0 ? '觸手拉回吸水建材，附著期間取水' : '觸手把碎石拉回，覆到身上';
        }
        continue;
      }
      const dx = stone.x - a.x, dz = stone.z - a.z;
      const front = dx * forward.x + dz * forward.z;
      const side = -dx * forward.z + dz * forward.x;
      if (attached + reaching < 20 && reaching < 4 && front > 0.82 && front < 1.65 && Math.abs(side) < 0.78) {
        stone.grab = { age: 0, duration: 1.65, side: clamp(side, -0.52, 0.52) };
        reaching++;
        world.event = '觸手伸向前方碎石，貼住後慢慢拉回';
      }
      continue;
    }
    const carrier = stone.carrier;
    carrier.progress = Math.min(1, carrier.progress + distance / 1.78);
    const totalTaken = carrier.initialWater * Math.min(1, carrier.progress / 0.72);
    const amount = Math.max(0, Math.min(stone.water, totalTaken - carrier.taken));
    stone.water -= amount; carrier.taken += amount; world.absorbed += amount;
    if (carrier.progress >= 1) {
      const pos = stonePosition(world, stone);
      const side = carrier.side;
      stone.drop = {
        age: 0, landTime: 1.15, duration: 1.85, side, from: pos,
        to: {
          x: a.x - forward.x * 1.48 - forward.z * side,
          z: a.z - forward.z * 1.48 + forward.x * side,
        },
      };
      world.event = '後方觸手托住碎石，慢慢放回地面';
    }
  }
  updateSourceStrength(world);
  updateSensors(world);
}
