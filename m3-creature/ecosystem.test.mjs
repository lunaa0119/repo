import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, createScenario, stepWorld, totalWater, moveSource, stonePosition, ACTIVE_WATER_ML } from './ecosystem.mjs';

function run(world, seconds) { for (let i = 0; i < Math.ceil(seconds * 60); i++) stepWorld(world, 1 / 60); }
function conserved(world, before) { assert.ok(Math.abs(totalWater(world) - before) < 1e-6); }

test('日照、降雨、吸水與分裂共用有限水量，不憑空補水', () => {
  const w = createScenario('division'), before = totalWater(w), stones = w.stones.length;
  for (let i = 0; i < 6; i++) {
    w.settings.sunlight = i % 2 ? 0.95 : 0.12;
    w.settings.rain = i % 3 === 0;
    run(w, 15); conserved(w, before);
  }
  assert.ok(w.births > 0 && w.evaporated > 0 && w.precipitated > 0);
  assert.equal(w.stones.length, stones);
  for (const a of w.agents) assert.ok(a.water >= 0 && Number.isFinite(a.water));
  for (const s of w.stones) {
    assert.ok(s.water >= 0);
    const owner = s.carrier?.ownerId ?? s.grab?.ownerId ?? s.drop?.ownerId;
    if (owner !== undefined) assert.ok(w.agents.some(a => a.id === owner));
  }
});

test('容量已滿仍須環境足夠濕潤；未達容量時也不提早分裂', () => {
  const dry = createScenario('division');
  dry.sources = []; dry.settings.sunlight = 0; dry.settings.speed = 0;
  run(dry, 6);
  assert.equal(dry.births, 0); assert.equal(dry.agent.division, null);
  const small = createScenario('division');
  small.settings.capacity = 400; small.settings.speed = 0;
  run(small, 1);
  assert.equal(small.births, 0); assert.equal(small.agent.division, null);
});

test('薄膜分離不創造水，新個體立即活動且不繼承石殼', () => {
  const w = createScenario('division'), before = totalWater(w);
  w.settings.speed = 0;
  for (let i = 0; i < 600 && w.births === 0; i++) stepWorld(w, 1 / 60);
  assert.equal(w.births, 1); assert.equal(w.agents.length, 2);
  const child = w.agents[1];
  assert.equal(child.phase, 'active'); assert.ok(child.water >= ACTIVE_WATER_ML);
  assert.ok(w.agent.water >= ACTIVE_WATER_ML);
  assert.equal(w.stones.filter(s => s.carrier?.ownerId === child.id).length, 0);
  assert.equal(w.stones.filter(s => s.grab?.ownerId === child.id).length, 0);
  conserved(w, before);
});

test('新個體自行伸觸手取石，接觸前不移動石頭；附著後石頭留在原地', () => {
  const w = createScenario('division'); w.settings.speed = 0;
  for (let i = 0; i < 600 && !w.births; i++) stepWorld(w, 1 / 60);
  const a = w.agents[1];
  const stone = { ...w.stones[100], id: 0, carrier: null, grab: null, drop: null, patch: -1, water: 0,
    x: a.x + Math.cos(a.angle) * 1.2 * a.scale, z: a.z + Math.sin(a.angle) * 1.2 * a.scale };
  w.stones = [stone];
  const start = stonePosition(w, stone);
  run(w, 0.2);
  assert.equal(stone.grab?.ownerId, a.id); assert.deepEqual(stonePosition(w, stone), start);
  run(w, 1.6);
  assert.equal(stone.carrier?.ownerId, a.id);
  const attached = stonePosition(w, stone);
  a.x += 0.05;
  assert.deepEqual(stonePosition(w, stone), attached);
});

test('低於體內 100 mL 時停止移動，保留少量石殼，沒有死亡或移除個體', () => {
  const w = createScenario('dry'), a = w.agent, before = totalWater(w);
  const position = [a.x, a.z];
  run(w, 30);
  assert.equal(a.phase, 'dormant'); assert.equal(a.speed, 0);
  assert.deepEqual([a.x, a.z], position); assert.equal(w.agents.length, 1);
  assert.ok(a.water < ACTIVE_WATER_ML);
  const retained = w.stones.filter(s => s.carrier?.ownerId === a.id).length;
  assert.ok(retained > 0 && retained <= 3);
  assert.equal(w.stones.filter(s => s.grab).length, 0);
  conserved(w, before);
});

test('降雨把已有水氣送回地表，休眠個體補水後能恢復', () => {
  const w = createScenario('dry'), before = totalWater(w), vapour = w.atmosphere;
  w.settings.sunlight = 0.1; w.settings.rain = true;
  run(w, 10);
  assert.equal(w.agent.phase, 'active'); assert.ok(w.agent.water >= ACTIVE_WATER_ML);
  assert.ok(w.atmosphere < vapour && w.precipitated > 0);
  conserved(w, before);
});

test('相同日照下石殼遮蔽減少蒸發；水仍回到環境帳本', () => {
  const covered = createWorld(), bare = createWorld();
  for (const w of [covered, bare]) {
    w.groundWater = 0; w.settings.speed = 0; w.settings.sunlight = 1;
    for (const s of w.stones) s.water = 0;
  }
  for (const s of bare.stones) s.carrier = null;
  const c = totalWater(covered), b = totalWater(bare);
  run(covered, 1); run(bare, 1);
  assert.ok(covered.evaporated < bare.evaporated);
  conserved(covered, c); conserved(bare, b);
});

test('暫停不推進生命循環；移濕區不增減任何水量', () => {
  const w = createWorld(), before = JSON.stringify(w), total = totalWater(w);
  stepWorld(w, 0); assert.equal(JSON.stringify(w), before);
  const position = [w.agent.x, w.agent.z];
  moveSource(w, 0, -4, 2);
  assert.deepEqual([w.agent.x, w.agent.z], position);
  conserved(w, total);
});
