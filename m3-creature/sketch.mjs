import * as T from 'three';
import { OrbitControls } from '../m2-species/vendor/OrbitControls.js';
import { createWorld, createScenario, stepWorld, humidityAt, sensorPositions, stonePosition, moveSource, bounds, agentById, shellCoverage, totalWater } from './ecosystem.mjs';
import { createSpecimenRenderer } from './specimen-visual.mjs';

const $ = id => document.getElementById(id);
let film = null, filmTimer = null;
const stage = $('stage');
let world = createWorld(), paused = false, editing = false, following = true, playback = 1, last = performance.now(), accumulator = 0;
const scene = new T.Scene();
scene.background = new T.Color('#080d10');
scene.fog = new T.FogExp2('#080d10', 0.045);
const camera = new T.OrthographicCamera(-11, 11, 8, -8, 0.1, 100);
camera.position.set(0, 18, 13); camera.lookAt(0, 0, 0);
let renderer;
try {
  renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
} catch (error) {
  $('error').hidden = false;
  $('error').textContent = `無法啟動 3D：${error.message}。請用支援 WebGL 的瀏覽器開啟。`;
  throw error;
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
renderer.outputColorSpace = T.SRGBColorSpace;
renderer.toneMapping = T.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = T.PCFSoftShadowMap;
stage.append(renderer.domElement);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.minZoom = 0.8; controls.maxZoom = 8;
controls.maxPolarAngle = Math.PI * 0.47;
controls.target.set(0, 0, 0);
camera.zoom = 4.2; camera.updateProjectionMatrix();
scene.add(new T.HemisphereLight('#adc8d3', '#151014', 0.9));
const sun = new T.DirectionalLight('#f2ece2', 2.6);
sun.position.set(-5, 12, 6); sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -12; sun.shadow.camera.right = 12;
sun.shadow.camera.top = 10; sun.shadow.camera.bottom = -10;
sun.shadow.bias = -0.0008;
scene.add(sun);
const rim = new T.DirectionalLight('#db8fbd', 2.4); rim.position.set(5, 5, -6); scene.add(rim);
const fill = new T.DirectionalLight('#8fd4d7', 1.7); fill.position.set(-5, 4, 3); scene.add(fill);
const specimens = createSpecimenRenderer(scene, renderer);

function soilTexture() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#65664e'; ctx.fillRect(0, 0, 512, 512);
  let seed = 712;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 35000; i++) {
    const shade = random() > 0.5 ? '204,193,151' : '28,32,24';
    ctx.fillStyle = `rgba(${shade},${0.03 + random() * 0.14})`;
    const size = 0.5 + random() * 2; ctx.fillRect(random() * 512, random() * 512, size, size);
  }
  const tex = new T.CanvasTexture(canvas); tex.colorSpace = T.SRGBColorSpace;
  tex.wrapS = tex.wrapT = T.RepeatWrapping; tex.repeat.set(4, 3);
  return tex;
}
const soil = new T.Mesh(new T.BoxGeometry(20.4, 0.28, 14.4), new T.MeshStandardMaterial({ color: '#313a35', map: soilTexture(), roughness: 0.85 }));
soil.position.y = -0.16; soil.receiveShadow = true; scene.add(soil);
const plinth = new T.Mesh(new T.BoxGeometry(20.6, 0.32, 14.6), new T.MeshStandardMaterial({ color: '#303b32', roughness: 0.9 }));
plinth.position.y = -0.43; scene.add(plinth);

// 所有碎石只有一份狀態。被拾起的就是原來的地面碎石，放回時不另外生成。
const stoneMaterial = new T.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.48, clearcoat: 0.35, clearcoatRoughness: 0.4 });
const stonesMesh = new T.InstancedMesh(new T.DodecahedronGeometry(1, 1), stoneMaterial, world.stones.length);
stonesMesh.instanceMatrix.setUsage(T.DynamicDrawUsage); stonesMesh.castShadow = true; stonesMesh.receiveShadow = true;
scene.add(stonesMesh);
const dummy = new T.Object3D(), colour = new T.Color();

// 觸手沿彎曲路徑伸向同一顆地面石頭，接觸後跟著石頭拉回身前。
const tentacleSegments = 14;
const tentacleMaterial = new T.MeshPhysicalMaterial({ color: '#b9a7c8', roughness: 0.2, transmission: 0.25, thickness: 0.04, clearcoat: 1 });
const armGeometry = new T.CylinderGeometry(1, 1, 1, 7), tipGeometry = new T.SphereGeometry(1, 10, 8);
let armCapacity = 32;
let tentacles = new T.InstancedMesh(armGeometry, tentacleMaterial, armCapacity * tentacleSegments);
tentacles.instanceMatrix.setUsage(T.DynamicDrawUsage); tentacles.frustumCulled = false;
tentacles.castShadow = true; scene.add(tentacles);
let tips = new T.InstancedMesh(tipGeometry, tentacleMaterial, armCapacity);
tips.frustumCulled = false; scene.add(tips);
const tentacleDummy = new T.Object3D(), up = new T.Vector3(0, 1, 0);
function syncTentacles() {
  const active = world.stones.filter(s => s.grab).map(stone => ({ stone, rear: false }))
    .concat(world.stones.filter(s => s.drop).map(stone => ({ stone, rear: true })));
  if (active.length > armCapacity) {
    while (armCapacity < active.length) armCapacity *= 2;
    scene.remove(tentacles, tips); tentacles.dispose(); tips.dispose();
    tentacles = new T.InstancedMesh(armGeometry, tentacleMaterial, armCapacity * tentacleSegments);
    tips = new T.InstancedMesh(tipGeometry, tentacleMaterial, armCapacity);
    tentacles.instanceMatrix.setUsage(T.DynamicDrawUsage);
    tentacles.castShadow = true; tentacles.frustumCulled = tips.frustumCulled = false;
    scene.add(tentacles, tips);
  }
  tentacles.count = active.length * tentacleSegments; tips.count = active.length;
  active.forEach(({ stone, rear }, arm) => {
    const state = rear ? stone.drop : stone.grab;
    const a = agentById(world, state.ownerId);
    const side = (state.side >= 0 ? 0.34 : -0.34) * a.scale;
    const anchor = (rear ? -0.46 : 0.43) * a.scale;
    const start = new T.Vector3(a.x + Math.cos(a.angle) * anchor - Math.sin(a.angle) * side, 0.14, a.z + Math.sin(a.angle) * anchor + Math.cos(a.angle) * side);
    const contact = stonePosition(world, stone);
    const target = new T.Vector3(contact.x, contact.y + 0.065, contact.z);
    const reach = rear
      ? 1 - Math.max(0, Math.min(1, (state.age - state.landTime) / (state.duration - state.landTime)))
      : Math.min(1, state.age / state.duration / 0.42);
    const ease = reach * reach * (3 - 2 * reach);
    const end = start.clone().lerp(target, ease);
    const control = start.clone().lerp(end, 0.5);
    control.y += (rear ? 0.24 : 0.32) + Math.sin(world.time * 2 + arm) * 0.025;
    const curve = new T.QuadraticBezierCurve3(start, control, end);
    for (let j = 0; j < tentacleSegments; j++) {
      const p = curve.getPoint(j / tentacleSegments), q = curve.getPoint((j + 1) / tentacleSegments);
      const delta = q.clone().sub(p), length = delta.length();
      tentacleDummy.position.copy(p).add(q).multiplyScalar(0.5);
      tentacleDummy.quaternion.setFromUnitVectors(up, length > 0.00001 ? delta.divideScalar(length) : up);
    const radius = 0.016 * a.scale * (1 - j / tentacleSegments * 0.55);
      tentacleDummy.scale.set(radius, Math.max(length, 0.0001), radius);
      tentacleDummy.updateMatrix(); tentacles.setMatrixAt(arm * tentacleSegments + j, tentacleDummy.matrix);
    }
    tentacleDummy.position.copy(end); tentacleDummy.quaternion.identity(); tentacleDummy.scale.set(0.055 / 3, 0.035 / 3, 0.055 / 3);
    tentacleDummy.updateMatrix(); tips.setMatrixAt(arm, tentacleDummy.matrix);
  });
  tentacles.instanceMatrix.needsUpdate = true; tips.instanceMatrix.needsUpdate = true;
}

const fieldCanvas = document.createElement('canvas'); fieldCanvas.width = 160; fieldCanvas.height = 112;
const fieldCtx = fieldCanvas.getContext('2d');
const fieldTexture = new T.CanvasTexture(fieldCanvas);
fieldTexture.colorSpace = T.SRGBColorSpace;
const field = new T.Mesh(new T.PlaneGeometry(19, 13), new T.MeshBasicMaterial({ map: fieldTexture, transparent: true, opacity: 0.7, depthWrite: false }));
field.rotation.x = -Math.PI / 2; field.position.y = 0.018; field.visible = false; scene.add(field);
function drawField() {
  const image = fieldCtx.createImageData(fieldCanvas.width, fieldCanvas.height);
  for (let j = 0; j < fieldCanvas.height; j++) for (let i = 0; i < fieldCanvas.width; i++) {
    const x = (i / (fieldCanvas.width - 1) * 2 - 1) * bounds.x;
    const z = (j / (fieldCanvas.height - 1) * 2 - 1) * bounds.z;
    const h = Math.min(1, (humidityAt(world, x, z) - 0.38) / 0.55);
    const at = (j * fieldCanvas.width + i) * 4;
    image.data[at] = 117 - 30 * h; image.data[at + 1] = 112 + 88 * h;
    image.data[at + 2] = 76 + 111 * h; image.data[at + 3] = 70 + 130 * h;
  }
  fieldCtx.putImageData(image, 0, 0); fieldTexture.needsUpdate = true;
}
const sensorGroup = new T.Group(); sensorGroup.visible = false; scene.add(sensorGroup);
const probes = ['#f3dca3', '#a8e8dc'].map(c => {
  const probe = new T.Mesh(new T.SphereGeometry(0.075, 14, 10), new T.MeshBasicMaterial({ color: c, depthTest: false }));
  probe.renderOrder = 4; sensorGroup.add(probe); return probe;
});
const sensorGeometry = new T.BufferGeometry(); sensorGeometry.setAttribute('position', new T.BufferAttribute(new Float32Array(12), 3));
sensorGroup.add(new T.LineSegments(sensorGeometry, new T.LineBasicMaterial({ color: '#f3ecc8', depthTest: false, transparent: true, opacity: 0.75 })));
const markers = world.sources.map(() => {
  const ring = new T.Mesh(new T.RingGeometry(0.21, 0.25, 32), new T.MeshBasicMaterial({ color: '#b9e6cb', side: T.DoubleSide, depthTest: false }));
  ring.rotation.x = -Math.PI / 2; ring.renderOrder = 5; scene.add(ring); ring.visible = false; return ring;
});
const trailPoints = [];
const trailGeometry = new T.BufferGeometry();
trailGeometry.setAttribute('position', new T.BufferAttribute(new Float32Array(1400 * 3), 3).setUsage(T.DynamicDrawUsage));
trailGeometry.setDrawRange(0, 0);
const trail = new T.Line(trailGeometry, new T.LineBasicMaterial({ color: '#e1cf94', transparent: true, opacity: 0.8, depthTest: false }));
trail.renderOrder = 3; scene.add(trail);
const rainGeometry = new T.BufferGeometry();
rainGeometry.setAttribute('position', new T.BufferAttribute(new Float32Array(96 * 6), 3));
const rainLines = new T.LineSegments(rainGeometry, new T.LineBasicMaterial({ color: '#a3d6dc', transparent: true, opacity: 0.32, depthWrite: false }));
rainLines.frustumCulled = false; scene.add(rainLines);
let nextTrail = 0, nextField = 0, nextUI = 0;
function syncScene() {
  const a = world.agent;
  specimens.sync(world);
  rainLines.visible = world.settings.rain && world.atmosphere > 0;
  if (rainLines.visible) {
    const p = rainGeometry.attributes.position;
    for (let i = 0; i < 96; i++) {
      const x = a.x + Math.sin(i * 73.1) * 4, z = a.z + Math.cos(i * 37.7) * 3;
      const y = 4 - ((world.time * 2 + i * 0.371) % 4);
      p.setXYZ(i * 2, x, y, z); p.setXYZ(i * 2 + 1, x + 0.025, y + 0.12, z);
    }
    p.needsUpdate = true;
  }
  if (following) {
    camera.position.x += a.x - controls.target.x; camera.position.z += a.z - controls.target.z;
    controls.target.set(a.x, 0, a.z);
  }
  syncTentacles();
  for (const s of world.stones) {
    const position = stonePosition(world, s);
    dummy.position.set(position.x, position.y, position.z);
    dummy.rotation.set(0.15 * Math.sin(s.id), s.rotation, 0.09 * Math.cos(s.id));
    dummy.scale.set(s.size * 1.2, s.size * 0.36, s.size * s.shape);
    dummy.updateMatrix(); stonesMesh.setMatrixAt(s.id, dummy.matrix);
    if (s.patch >= 0) colour.setHSL(0.2, 0.13 + s.water * 0.003, 0.24 + s.shade * 0.12, T.SRGBColorSpace);
    else colour.setHSL(0.19 + s.shade * 0.04, 0.05 + s.shade * 0.07, 0.22 + s.shade * 0.2, T.SRGBColorSpace);
    if (s.carrier || s.grab || s.drop) colour.multiplyScalar(1.12);
    else colour.multiplyScalar(0.48);
    stonesMesh.setColorAt(s.id, colour);
  }
  stonesMesh.instanceMatrix.needsUpdate = true; stonesMesh.instanceColor.needsUpdate = true;
  // 每個實例可能移動；關閉視錐裁切以免舊邊界框讓碎石消失。
  stonesMesh.frustumCulled = false;
  const sensors = sensorPositions(a);
  probes[0].position.set(sensors.left.x, 0.31, sensors.left.z);
  probes[1].position.set(sensors.right.x, 0.31, sensors.right.z);
  const lines = sensorGeometry.attributes.position;
  lines.setXYZ(0, a.x, 0.30, a.z); lines.setXYZ(1, sensors.left.x, 0.31, sensors.left.z);
  lines.setXYZ(2, a.x, 0.30, a.z); lines.setXYZ(3, sensors.right.x, 0.31, sensors.right.z); lines.needsUpdate = true;
  markers.forEach((marker, i) => { marker.position.set(world.sources[i].x, 0.3, world.sources[i].z); });
  if (world.time >= nextTrail) {
    trailPoints.push(new T.Vector3(a.x, 0.23, a.z));
    if (trailPoints.length > 1400) trailPoints.shift();
    const attribute = trailGeometry.attributes.position;
    trailPoints.forEach((point, i) => attribute.setXYZ(i, point.x, point.y, point.z));
    attribute.needsUpdate = true;
    trailGeometry.setDrawRange(0, trailPoints.length);
    trail.frustumCulled = false;
    nextTrail = world.time + 0.25;
  }
  if (field.visible && world.time >= nextField) { drawField(); nextField = world.time + 1; }
}

function updateUI() {
  const a = world.agent;
  $('left-value').textContent = a.left.toFixed(3); $('right-value').textContent = a.right.toFixed(3);
  $('stones-value').textContent = `${world.picked} / ${world.released}`;
  $('water-value').textContent = `${world.absorbed.toFixed(1)} mL`;
  $('body-water').textContent = Math.round(a.water);
  $('phase-value').textContent = a.phase === 'dormant' ? '微縮休眠' : a.division ? '正在分裂' : '活動中';
  $('phase-value').dataset.phase = a.phase;
  $('population-value').textContent = world.agents.length;
  $('dormant-value').textContent = world.agents.filter(x => x.phase === 'dormant').length;
  $('births-value').textContent = world.births;
  $('shade-value').textContent = `${Math.round(shellCoverage(world, a) * 100)}%`;
  $('ground-water').textContent = Math.round(world.groundWater + world.stones.reduce((n, s) => n + s.water, 0));
  $('body-total').textContent = Math.round(world.agents.reduce((n, x) => n + x.water, 0));
  $('vapour-water').textContent = Math.round(world.atmosphere);
  $('total-water').textContent = totalWater(world).toFixed(1);
  $('water-gauge').style.setProperty('--water-level', `${Math.min(1, a.water / world.settings.capacity) * 100}%`);
  $('capacity-mark').textContent = `${world.settings.capacity} mL`;
  const focus = $('focus');
  if (focus.options.length !== world.agents.length) {
    focus.replaceChildren(...world.agents.map(x => new Option(`個體 ${String(x.id + 1).padStart(2, '0')}`, x.id)));
  }
  focus.value = a.id;
  sun.intensity = 1.3 + world.settings.sunlight * 2.5;
  soil.material.roughness = world.settings.rain ? 0.55 : 0.85;
  $('weather-label').textContent = world.settings.rain ? 'RAIN / 水回到地表' : 'SUN / 日照蒸發';
  $('event').textContent = world.event;
  $('time').textContent = `${String(Math.floor(world.time / 60)).padStart(2, '0')}:${String(Math.floor(world.time % 60)).padStart(2, '0')}`;
  $('state-label').textContent = paused ? '觀察已暫停' : a.phase === 'dormant' ? '等待水分 · 仍然存活' : a.division ? '薄膜正在分離' : '生命循環進行中';
}
function resize() {
  const w = stage.clientWidth, h = stage.clientHeight, aspect = w / h;
  camera.top = 8.7; camera.bottom = -8.7; camera.left = -8.7 * aspect; camera.right = 8.7 * aspect;
  camera.updateProjectionMatrix(); renderer.setSize(w, h);
}
new ResizeObserver(resize).observe(stage);
$('pause').onclick = () => { paused = !paused; $('pause').textContent = paused ? '繼續' : '暫停'; updateUI(); };
$('closeup').onclick = () => {
  following = !following; $('closeup').setAttribute('aria-pressed', following);
  camera.zoom = following ? 4.2 : 1;
  if (!following) { controls.target.set(0, 0, 0); camera.position.set(0, 18, 13); }
  camera.updateProjectionMatrix(); syncScene();
};
$('reset').onclick = () => {
  world = createWorld(); paused = false; accumulator = 0; trailPoints.length = 0;
  nextTrail = nextField = nextUI = 0;
  world.settings.sensing = $('sensing').checked;
  world.settings.sensitivity = Number($('sensitivity').value);
  world.settings.irregularity = Number($('irregularity').value);
  world.settings.sunlight = Number($('sunlight').value);
  world.settings.rain = $('rain').checked;
  world.settings.capacity = Number($('capacity').value);
  $('pause').textContent = '暫停'; syncScene(); drawField(); updateUI();
};
$('focus').onchange = e => {
  world.agent = agentById(world, Number(e.target.value));
  trailPoints.length = 0; nextTrail = 0; syncScene(); updateUI();
};
for (const scenario of ['division', 'dry']) $(`${scenario}-demo`).onclick = () => {
  world = createScenario(scenario); paused = false; accumulator = 0;
  trailPoints.length = 0; nextTrail = nextField = nextUI = 0;
  for (const name of ['sunlight', 'capacity', 'sensitivity', 'irregularity']) {
    $(name).value = world.settings[name]; $(name).dispatchEvent(new Event('input'));
  }
  $('rain').checked = world.settings.rain; $('sensing').checked = world.settings.sensing;
  $('pause').textContent = '暫停'; drawField(); syncScene(); updateUI();
};
$('rain').onchange = e => { world.settings.rain = e.target.checked; drawField(); updateUI(); };
$('sunlight').oninput = e => {
  world.settings.sunlight = Number(e.target.value); $('sunlight-value').textContent = `${Math.round(world.settings.sunlight * 100)}%`;
  updateUI();
};
$('capacity').oninput = e => {
  world.settings.capacity = Number(e.target.value); $('capacity-value').textContent = `${world.settings.capacity} mL`;
  updateUI();
};
$('moisture').onchange = e => {
  field.visible = e.target.checked; $('legend').hidden = !field.visible;
  markers.forEach(m => { m.visible = field.visible || editing; }); drawField();
};
$('sensors').onchange = e => { sensorGroup.visible = e.target.checked; };
$('reveal').onchange = e => {
  stoneMaterial.transparent = e.target.checked; stoneMaterial.opacity = e.target.checked ? 0.25 : 1;
  stoneMaterial.depthWrite = !e.target.checked; stoneMaterial.needsUpdate = true;
};
$('trail').onchange = e => { trail.visible = e.target.checked; };
$('sensing').onchange = e => { world.settings.sensing = e.target.checked; updateUI(); };
for (const name of ['sensitivity', 'irregularity']) $(name).oninput = e => {
  world.settings[name] = Number(e.target.value);
  $(name + '-value').textContent = Number(e.target.value).toFixed(name === 'sensitivity' ? 1 : 2);
};
$('speed').oninput = e => { playback = Number(e.target.value); $('speed-value').textContent = `${playback}×`; };
$('move-source').onclick = () => {
  editing = !editing; controls.enableRotate = !editing; controls.enablePan = !editing;
  $('move-source').setAttribute('aria-pressed', editing);
  $('scene-tip').textContent = editing ? '點擊地面，移動第一處濕區與建材' : '拖曳旋轉 · 滾輪縮放 · 右鍵平移';
  markers.forEach(m => { m.visible = editing || field.visible; });
};
const raycaster = new T.Raycaster(), plane = new T.Plane(new T.Vector3(0, 1, 0), 0);
renderer.domElement.addEventListener('pointerdown', e => {
  if (!editing || e.button !== 0) return;
  const rect = renderer.domElement.getBoundingClientRect();
  raycaster.setFromCamera(new T.Vector2((e.clientX - rect.left) / rect.width * 2 - 1, -(e.clientY - rect.top) / rect.height * 2 + 1), camera);
  const point = new T.Vector3();
  if (!raycaster.ray.intersectPlane(plane, point)) return;
  moveSource(world, 0, point.x, point.z); drawField(); syncScene(); updateUI();
});

addEventListener('error', event => { $('error').hidden = false; $('error').textContent = `執行錯誤：${event.message}`; });
addEventListener('unhandledrejection', event => { $('error').hidden = false; $('error').textContent = `載入錯誤：${event.reason?.message ?? event.reason}`; });
async function beginFilm() {
  if (film || $('record-demo').disabled) return;
  $('record-demo').disabled = true;
  const saved = { paused, following, playback, ratio: renderer.getPixelRatio(),
    position: camera.position.clone(), zoom: camera.zoom, target: controls.target.clone(),
    trail: trail.visible, field: field.visible, sensors: sensorGroup.visible };
  try {
    const { startFilm } = await import('./record-film.mjs');
    paused = false; following = false; playback = 1;
    trail.visible = field.visible = sensorGroup.visible = false;
    if (new URLSearchParams(location.search).has('frames')) {
      renderer.setAnimationLoop(null);
      const originalWorld = world;
      try {
        const { exportFilmFrames } = await import('./record-frames.mjs');
        await exportFilmFrames({ renderer, camera, controls, createWorld, createScenario, stepWorld, totalWater, updateUI,
          getWorld: () => world, setWorld: next => { world = next; trailPoints.length = 0; nextTrail = nextField = 0; },
          syncScene, renderScene: () => renderer.render(scene, camera) });
      } finally {
        world = originalWorld; paused = saved.paused; following = saved.following; playback = saved.playback;
        renderer.setPixelRatio(saved.ratio); camera.position.copy(saved.position); camera.zoom = saved.zoom;
        controls.target.copy(saved.target); controls.enabled = true;
        trail.visible = saved.trail; field.visible = saved.field; sensorGroup.visible = saved.sensors;
        $('record-demo').disabled = false; resize(); syncScene(); updateUI();
        renderer.setAnimationLoop(animate);
      }
      return;
    }
    film = await startFilm({ renderer, camera, controls, createWorld, createScenario, totalWater,
      getWorld: () => world, setWorld: next => { world = next; trailPoints.length = 0; nextTrail = nextField = 0; accumulator = 0; },
      syncScene, renderScene: () => renderer.render(scene, camera),
      restore: () => {
        clearInterval(filmTimer); filmTimer = null;
        film = null; paused = saved.paused; following = saved.following; playback = saved.playback;
        renderer.setPixelRatio(saved.ratio); camera.position.copy(saved.position); camera.zoom = saved.zoom;
        controls.target.copy(saved.target); controls.enabled = true;
        trail.visible = saved.trail; field.visible = saved.field; sensorGroup.visible = saved.sensors;
        $('record-demo').disabled = false; resize(); syncScene(); updateUI();
        renderer.setAnimationLoop(animate);
      },
    });
    // 畫布錄影由計時器推進，避免被視窗遮擋時 requestAnimationFrame 停止。
    renderer.setAnimationLoop(null);
    filmTimer = setInterval(() => animate(performance.now()), 1000 / 30);
  } catch (error) { $('record-status').textContent = `錄製失敗：${error.message}`; $('record-demo').disabled = false; }
}
$('record-demo').onclick = beginFilm;
resize(); syncScene(); drawField(); updateUI();
function animate(now) {
  const dt = Math.min((now - last) / 1000, film ? 0.75 : 0.1); last = now;
  const filming = film?.frame(now);
  if (!paused) {
    accumulator += dt * playback;
    while (accumulator >= 1 / 60) { stepWorld(world, 1 / 60); accumulator -= 1 / 60; }
    syncScene();
  }
  if (!filming) controls.update();
  if (now >= nextUI) { updateUI(); nextUI = now + 120; }
  renderer.render(scene, camera);
  if (filming) film?.capture(now);
}
renderer.setAnimationLoop(animate);
if (new URLSearchParams(location.search).has('film')) beginFilm();
