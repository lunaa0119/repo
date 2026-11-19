// 石殻姆的展示規則。mL 是水量帳本，畫面距離、速率與分裂容量不是實測值。
// 原 simulation.mjs 保留為 10/22 的行為小實驗；本頁從這裡計算新的生命循環。
import { createWorld as createOriginalWorld, bounds } from './simulation.mjs';
export { bounds };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const ACTIVE_WATER_ML = 100;
export const DEMO = Object.freeze({ capacity: 260, newbornWater: 110, divisionSeconds: 4 });

function makeAgent(id, x, z, angle, water, born = 0) {
  return { id, x, z, angle, water, born, phase: 'active', scale: 1, division: null,
    turn: 0, speed: 0, distance: 0, noise: 0, left: 0, right: 0,
    event: id ? '新個體自行摸索碎石，建立外殼' : '循著濕氣，慢慢探索地表' };
}
export function agentById(world, id = 0) { return world.agents.find(a => a.id === id); }
function ownerId(stone) { return stone.carrier?.ownerId ?? stone.grab?.ownerId ?? stone.drop?.ownerId; }
export function bodyScale(world, a) {
  return a.phase === 'dormant' ? 0.12 : clamp(Math.cbrt(a.water / world.settings.capacity), 0.24, 1.12);
}
export function totalWater(world) {
  return world.groundWater + world.atmosphere + world.agents.reduce((n, a) => n + a.water, 0)
    + world.stones.reduce((n, s) => n + s.water, 0);
}
export function shellCoverage(world, a) {
  const count = world.stones.reduce((n, s) => n + (s.carrier?.ownerId === a.id ? 1 : 0), 0);
  return clamp(count / Math.max(3, 20 * a.scale ** 2), 0, 1);
}

export function createWorld(seed = 415) {
  const world = createOriginalWorld(seed);
  world.agents = [makeAgent(0, world.agent.x, world.agent.z, world.agent.angle, 170)];
  world.agent = world.agents[0];
  Object.assign(world.settings, { sunlight: 0.35, rain: false, capacity: DEMO.capacity });
  Object.assign(world, { groundWater: 650, initialGroundWater: 650, atmosphere: 1200,
    evaporated: 0, precipitated: 0, births: 0, nextId: 1, recentLifeEvent: '', lifeEventTime: -10 });
  world.agent.scale = bodyScale(world, world.agent);
  for (const stone of world.stones) {
    stone.water *= 6;
    if (stone.carrier) {
      const c = stone.carrier, a = world.agent;
      c.ownerId = a.id;
      stone.x = a.x + Math.cos(a.angle) * (0.89 - 1.78 * c.progress) * a.scale - Math.sin(a.angle) * c.side * a.scale;
      stone.z = a.z + Math.sin(a.angle) * (0.89 - 1.78 * c.progress) * a.scale + Math.cos(a.angle) * c.side * a.scale;
    }
  }
  for (const source of world.sources) delete source.initialWater;
  updateSources(world);
  for (const a of world.agents) updateSensors(world, a);
  world.initialWater = totalWater(world);
  return world;
}

function updateSources(world) {
  for (let i = 0; i < world.sources.length; i++) {
    const source = world.sources[i];
    const remaining = world.stones.reduce((n, s) => n + (s.patch === i ? s.water : 0), 0);
    source.initialWater ??= remaining || 1;
    source.strength = 0.18 + 0.82 * remaining / source.initialWater;
  }
}
export function humidityAt(world, x, z) {
  let value = 0.22 + 0.16 * Math.min(1, world.groundWater / world.initialGroundWater);
  for (const source of world.sources) {
    value += 0.46 * source.strength * Math.exp(-((x - source.x) ** 2 + (z - source.z) ** 2) / (2 * source.radius ** 2));
  }
  if (world.settings.rain && world.groundWater > 0) value += 0.25;
  return clamp(value, 0, 1);
}
export function sensorPositions(a) {
  const s = a.scale, f = { x: Math.cos(a.angle), z: Math.sin(a.angle) };
  return {
    left: { x: a.x + f.x * 0.45 * s - f.z * 0.46 * s, z: a.z + f.z * 0.45 * s + f.x * 0.46 * s },
    right: { x: a.x + f.x * 0.45 * s + f.z * 0.46 * s, z: a.z + f.z * 0.45 * s - f.x * 0.46 * s },
  };
}
function updateSensors(world, a) {
  const p = sensorPositions(a);
  a.left = humidityAt(world, p.left.x, p.left.z); a.right = humidityAt(world, p.right.x, p.right.z);
}
export function stonePosition(world, stone) {
  if (stone.drop) {
    const d = stone.drop, p = clamp(d.age / d.landTime, 0, 1), smooth = p * p * (3 - 2 * p);
    return { x: d.from.x + (d.to.x - d.from.x) * smooth, z: d.from.z + (d.to.z - d.from.z) * smooth,
      y: d.from.y + (0.065 - d.from.y) * smooth + Math.sin(p * Math.PI) * 0.055 };
  }
  if (stone.grab) {
    const g = stone.grab, a = agentById(world, g.ownerId), p = clamp((g.age / g.duration - 0.42) / 0.58, 0, 1);
    const smooth = p * p * (3 - 2 * p), front = 0.89 * a.scale, side = g.side * a.scale;
    return { x: stone.x + (a.x + Math.cos(a.angle) * front - Math.sin(a.angle) * side - stone.x) * smooth,
      z: stone.z + (a.z + Math.sin(a.angle) * front + Math.cos(a.angle) * side - stone.z) * smooth,
      y: 0.065 + 0.055 * smooth + Math.sin(p * Math.PI) * 0.075 };
  }
  // 石頭留在原地，身體向前滑過；不再沿身體用接力搬運。
  return { x: stone.x, y: stone.carrier ? 0.12 : 0.065, z: stone.z };
}
export function moveSource(world, index, x, z) {
  const source = world.sources[index];
  const nextX = clamp(x, -bounds.x + 2.2, bounds.x - 2.2), nextZ = clamp(z, -bounds.z + 2.2, bounds.z - 2.2);
  for (const s of world.stones) {
    if (s.patch !== index || s.carrier || s.grab || s.drop) continue;
    s.x = clamp(s.x + nextX - source.x, -bounds.x, bounds.x);
    s.z = clamp(s.z + nextZ - source.z, -bounds.z, bounds.z);
  }
  source.x = nextX; source.z = nextZ;
  for (const a of world.agents) updateSensors(world, a);
}
function lifeEvent(world, a, text) {
  a.event = text; world.recentLifeEvent = text; world.lifeEventTime = world.time;
}
function changePhase(world, a) {
  const next = a.water < ACTIVE_WATER_ML ? 'dormant' : 'active';
  if (next === a.phase) return;
  a.phase = next;
  if (next === 'dormant') {
    a.speed = 0; a.division = null;
    let kept = 0;
    for (const stone of world.stones) {
      if (ownerId(stone) !== a.id) continue;
      if (stone.carrier && !stone.drop && kept < 3) {
        const angle = kept * Math.PI * 2 / 3;
        stone.x = a.x + Math.cos(angle) * 0.065; stone.z = a.z + Math.sin(angle) * 0.065;
        kept++; continue;
      }
      const position = stonePosition(world, stone);
      stone.x = position.x; stone.z = position.z;
      if (stone.carrier) world.released++;
      stone.carrier = null; stone.grab = null; stone.drop = null;
    }
    lifeEvent(world, a, `個體 ${a.id + 1} 缺水，縮成小石子並保留少量石殼`);
  } else lifeEvent(world, a, `個體 ${a.id + 1} 補足水分，恢復活動`);
}
function absorb(world, a, requested, reservoir) {
  const amount = Math.max(0, Math.min(requested, reservoir.water, world.settings.capacity - a.water));
  reservoir.water -= amount; a.water += amount; world.absorbed += amount;
  return amount;
}
function stepWater(world, a, dt) {
  const cover = shellCoverage(world, a);
  const area = a.phase === 'dormant' ? 0.025 : Math.max(0.2, a.scale ** 2);
  const loss = Math.min(a.water, 12 * world.settings.sunlight * area * (1 - 0.72 * cover) * dt);
  a.water -= loss; world.atmosphere += loss; world.evaporated += loss;
  const wetness = Math.max(0, humidityAt(world, a.x, a.z) - 0.38);
  // 以薄膜接觸潮濕地表的吸水，代替只靠觸手取得建材水。
  const ground = { water: world.groundWater };
  absorb(world, a, (a.phase === 'dormant' ? 8 : 16 * Math.max(0.3, a.scale ** 2)) * wetness * dt, ground);
  world.groundWater = ground.water;
  changePhase(world, a); a.scale = bodyScale(world, a);
}
function moveAgent(world, a, dt) {
  if (a.phase === 'dormant') return;
  updateSensors(world, a);
  const settings = world.settings, leftDrive = 1 - 0.6 * a.left, rightDrive = 1 - 0.6 * a.right;
  a.noise += -a.noise * 1.7 * dt + (world.random() * 2 - 1) * Math.sqrt(dt) * 0.7;
  let turn = (settings.sensing ? settings.sensitivity * (rightDrive - leftDrive) : 0) + settings.irregularity * a.noise;
  const nx = a.x / (bounds.x - 1), nz = a.z / (bounds.z - 1);
  const bx = Math.abs(nx) > 0.88 ? -Math.sign(nx) * (Math.abs(nx) - 0.88) * 6 : 0;
  const bz = Math.abs(nz) > 0.88 ? -Math.sign(nz) * (Math.abs(nz) - 0.88) * 6 : 0;
  turn += clamp(Math.cos(a.angle) * bz - Math.sin(a.angle) * bx, -0.8, 0.8);
  a.turn += clamp(clamp(turn, -0.8, 0.8) - a.turn, -dt * 0.8, dt * 0.8);
  a.angle += a.turn * dt;
  a.speed = settings.speed * a.scale * (settings.sensing ? (leftDrive + rightDrive) / 2 : 0.7);
  const distance = a.speed * dt;
  a.x = clamp(a.x + Math.cos(a.angle) * distance, -bounds.x + 0.9, bounds.x - 0.9);
  a.z = clamp(a.z + Math.sin(a.angle) * distance, -bounds.z + 0.9, bounds.z - 0.9);
  a.distance += distance;
  handleStones(world, a, distance, dt);
}
function handleStones(world, a, distance, dt) {
  const f = { x: Math.cos(a.angle), z: Math.sin(a.angle) }, scale = a.scale;
  let attached = world.stones.reduce((n, s) => n + (s.carrier?.ownerId === a.id ? 1 : 0), 0);
  let reaching = world.stones.reduce((n, s) => n + (s.grab?.ownerId === a.id ? 1 : 0), 0);
  for (const stone of world.stones) {
    const owner = ownerId(stone);
    if (owner !== undefined && owner !== a.id) continue;
    if (stone.drop) {
      stone.drop.age += dt;
      if (stone.drop.age >= stone.drop.landTime && stone.carrier) {
        stone.x = stone.drop.to.x; stone.z = stone.drop.to.z;
        stone.carrier = null; world.released++; attached--;
        a.event = '後方觸手放好碎石，解除吸附再收回';
      }
      if (stone.drop.age >= stone.drop.duration) stone.drop = null;
      continue;
    }
    if (!stone.carrier) {
      if (stone.grab) {
        stone.grab.age += dt;
        if (stone.grab.age >= stone.grab.duration) {
          const p = stonePosition(world, stone);
          stone.x = p.x; stone.z = p.z;
          stone.carrier = { ownerId: a.id, progress: 0, side: stone.grab.side };
          stone.grab = null; world.picked++; attached++; reaching--;
          a.event = '接觸後吸附碎石，覆到身上遮蔽日照';
        }
        continue;
      }
      const dx = stone.x - a.x, dz = stone.z - a.z;
      const front = (dx * f.x + dz * f.z) / scale, side = (-dx * f.z + dz * f.x) / scale;
      if (attached + reaching < Math.max(5, Math.ceil(20 * scale ** 2)) && reaching < 4
          && front > 0.82 && front < 1.65 && Math.abs(side) < 0.78) {
        stone.grab = { ownerId: a.id, age: 0, duration: 1.65, side: clamp(side, -0.52, 0.52) };
        reaching++; a.event = '沒有眼睛：伸出觸手，碰到碎石再取回';
      }
      continue;
    }
    const c = stone.carrier;
    c.progress = Math.min(1, c.progress + distance / (1.78 * scale));
    if (stone.water > 0) absorb(world, a, 5 * dt, stone);
    if (c.progress >= 1) {
      stone.drop = { ownerId: a.id, age: 0, landTime: 1.15, duration: 1.85, side: c.side,
        from: stonePosition(world, stone),
        to: { x: a.x - f.x * 1.48 * scale - f.z * c.side * scale,
          z: a.z - f.z * 1.48 * scale + f.x * c.side * scale } };
      a.event = '身體滑過原地的石頭，後方觸手將它放回';
    }
  }
}
function stepDivision(world, a, dt) {
  if (a.phase !== 'active') return;
  const humid = humidityAt(world, a.x, a.z) >= 0.64;
  const available = world.groundWater + world.stones.reduce((n, s) => n + s.water, 0);
  if (!a.division && a.water >= world.settings.capacity - 0.05 && humid && available > 0) {
    a.division = { age: 0, duration: DEMO.divisionSeconds };
    lifeEvent(world, a, `個體 ${a.id + 1} 容量已滿，薄膜開始收窄`);
  }
  if (!a.division) return;
  // 待決的水量分配採明示展示值，確保分離後兩個個體皆可活動。
  if (!humid || a.water < ACTIVE_WATER_ML + DEMO.newbornWater) return;
  a.division.age += dt;
  if (a.division.age < a.division.duration) return;
  const angle = a.angle + Math.PI / 2, offset = 1.35 * a.scale;
  const child = makeAgent(world.nextId++, clamp(a.x + Math.cos(angle) * offset, -bounds.x + 0.9, bounds.x - 0.9),
    clamp(a.z + Math.sin(angle) * offset, -bounds.z + 0.9, bounds.z - 0.9), a.angle + 0.45, DEMO.newbornWater, world.time);
  a.water -= child.water; a.division = null; a.scale = bodyScale(world, a);
  child.scale = bodyScale(world, child); updateSensors(world, child);
  world.agents.push(child); world.births++;
  lifeEvent(world, a, `新個體 ${child.id + 1} 已分離，立即活動並自行撿石`);
}
export function stepWorld(world, dt) {
  if (!(dt > 0)) return;
  dt = Math.min(dt, 0.05); world.time += dt;
  if (world.settings.rain) {
    const amount = Math.min(world.atmosphere, 32 * dt);
    world.atmosphere -= amount; world.groundWater += amount; world.precipitated += amount;
  }
  // 避免新生個體在出生的同一個時間步被額外更新。
  const agents = [...world.agents];
  for (const a of agents) { stepWater(world, a, dt); moveAgent(world, a, dt); }
  updateSources(world);
  for (const a of agents) { updateSensors(world, a); stepDivision(world, a, dt); }
  world.event = world.time - world.lifeEventTime < 5 ? world.recentLifeEvent : world.agent.event;
}

export function createScenario(name) {
  const world = createWorld();
  if (name === 'division') {
    const a = world.agent, dx = world.sources[0].x - a.x, dz = world.sources[0].z - a.z;
    a.x += dx; a.z += dz;
    for (const s of world.stones) if (s.carrier) { s.x += dx; s.z += dz; }
    const amount = world.settings.capacity - a.water;
    world.groundWater -= amount; a.water += amount; world.settings.sunlight = 0.12;
  } else if (name === 'dry') {
    world.atmosphere += world.groundWater; world.groundWater = 0;
    for (const s of world.stones) { world.atmosphere += s.water; s.water = 0; }
    world.atmosphere += world.agent.water - 96; world.agent.water = 96;
    world.settings.sunlight = 0.85; changePhase(world, world.agent);
  }
  for (const a of world.agents) a.scale = bodyScale(world, a);
  updateSources(world);
  for (const a of world.agents) updateSensors(world, a);
  world.event = world.agent.event;
  return world;
}
