import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, stepWorld, moveSource, stonePosition, bounds } from './simulation.mjs';

function controlledSource(z, sensing = true) {
  const w = createWorld();
  w.stones = [];
  w.sources = [{ x: 2, z, radius: 2, strength: 1, initialWater: 1 }];
  Object.assign(w.agent, { x: 0, z: 0, angle: 0 });
  Object.assign(w.settings, { sensing, irregularity: 0 });
  for (let i = 0; i < 300; i++) stepWorld(w, 1 / 60);
  return w;
}

test('左右濕區對調時，轉向相反；關閉循濕後保持原方向', () => {
  const left = controlledSource(2);
  const right = controlledSource(-2);
  const off = controlledSource(2, false);
  assert.ok(left.agent.angle > 0.05);
  assert.ok(right.agent.angle < -0.05);
  assert.ok(Math.abs(left.agent.angle + right.agent.angle) < 1e-10);
  assert.equal(off.agent.angle, 0);
});

test('碎石與水分守恆，放回建材前取完儲水，長時間移動保持有效範圍', () => {
  const w = createWorld();
  const count = w.stones.length;
  const originalWater = w.stones.reduce((n, s) => n + s.water, 0);
  let emptiedAndReleased = false;
  for (let i = 0; i < 60 * 180; i++) {
    const previous = new Map(w.stones.filter(s => s.carrier?.initialWater > 0).map(s => [s.id, true]));
    stepWorld(w, 1 / 60);
    for (const id of previous.keys()) {
      const stone = w.stones[id];
      if (!stone.carrier) { assert.ok(stone.water < 1e-10); emptiedAndReleased = true; }
    }
  }
  assert.equal(w.stones.length, count);
  assert.equal(new Set(w.stones.map(s => s.id)).size, count);
  assert.ok(w.picked > 0 && w.released > 0 && w.absorbed > 0);
  assert.ok(emptiedAndReleased);
  assert.ok(Math.abs(originalWater - w.absorbed - w.stones.reduce((n, s) => n + s.water, 0)) < 1e-8);
  assert.ok(Number.isFinite(w.agent.angle));
  assert.ok(Math.abs(w.agent.x) <= bounds.x && Math.abs(w.agent.z) <= bounds.z);
  assert.equal(w.stones.filter(s => s.carrier).length, 16 + w.picked - w.released);
});

test('暫停不改變狀態；移動濕區不補回已取走的水，也不移動身上建材', () => {
  const w = createWorld();
  for (let i = 0; i < 60 * 40; i++) stepWorld(w, 1 / 60);
  const before = JSON.stringify(w);
  stepWorld(w, 0);
  assert.equal(JSON.stringify(w), before);
  const water = w.stones.reduce((n, s) => n + s.water, 0);
  const attached = w.stones.filter(s => s.carrier).map(s => s.id);
  moveSource(w, 0, -5, 2);
  assert.equal(w.stones.reduce((n, s) => n + s.water, 0), water);
  assert.deepEqual(w.stones.filter(s => s.carrier).map(s => s.id), attached);
});

test('先伸觸手再拉石頭，接觸前石頭留在地面，不會直接跳到身上', () => {
  const w = createWorld();
  Object.assign(w.agent, { x: 0, z: 0, angle: 0 });
  Object.assign(w.settings, { sensing: false, irregularity: 0 });
  const stone = { ...w.stones[16], id: 0, x: 1.3, z: 0.2, patch: -1, water: 1, carrier: null, grab: null };
  w.stones = [stone];
  stepWorld(w, 1 / 60);
  assert.ok(stone.grab);
  assert.equal(w.picked, 0);
  for (let i = 0; i < 15; i++) stepWorld(w, 1 / 60);
  assert.deepEqual(stonePosition(w, stone), { x: 1.3, y: 0.065, z: 0.2 });
  assert.equal(w.absorbed, 0);
  for (let i = 0; i < 100; i++) stepWorld(w, 1 / 60);
  assert.equal(stone.grab, null);
  assert.ok(stone.carrier);
  assert.equal(w.picked, 1);
});
