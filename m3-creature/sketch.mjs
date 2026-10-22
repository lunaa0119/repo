import * as T from 'three';
import { OrbitControls } from '../m2-species/vendor/OrbitControls.js';
import { createWorld, stepWorld, humidityAt, sensorPositions, stonePosition, moveSource, bounds } from './simulation.mjs';

const $ = id => document.getElementById(id);
const stage = $('stage');
let world = createWorld(), paused = false, editing = false, following = true, playback = 1, last = performance.now(), accumulator = 0;
const scene = new T.Scene();
scene.background = new T.Color('#323a32');
scene.fog = new T.FogExp2('#514952', 0.015);
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
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.8));
renderer.outputColorSpace = T.SRGBColorSpace;
renderer.toneMapping = T.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = T.PCFSoftShadowMap;
stage.append(renderer.domElement);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.minZoom = 0.8; controls.maxZoom = 5;
controls.maxPolarAngle = Math.PI * 0.47;
controls.target.set(0, 0, 0);
camera.zoom = 2.15; camera.updateProjectionMatrix();
scene.add(new T.HemisphereLight('#c5d1c5', '#3e3329', 2.7));
const sun = new T.DirectionalLight('#f2e3bf', 3.1);
sun.position.set(-5, 12, 6); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -12; sun.shadow.camera.right = 12;
sun.shadow.camera.top = 10; sun.shadow.camera.bottom = -10;
sun.shadow.bias = -0.0008;
scene.add(sun);

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
const soil = new T.Mesh(new T.BoxGeometry(20.4, 0.28, 14.4), new T.MeshStandardMaterial({ color: '#b1aa8f', map: soilTexture(), roughness: 0.95 }));
soil.position.y = -0.16; soil.receiveShadow = true; scene.add(soil);
const plinth = new T.Mesh(new T.BoxGeometry(20.6, 0.32, 14.6), new T.MeshStandardMaterial({ color: '#303b32', roughness: 0.9 }));
plinth.position.y = -0.43; scene.add(plinth);

// 所有碎石只有一份狀態。被拾起的就是原來的地面碎石，放回時不另外生成。
const stoneMaterial = new T.MeshStandardMaterial({ color: '#ffffff', roughness: 0.91 });
const stonesMesh = new T.InstancedMesh(new T.DodecahedronGeometry(1, 0), stoneMaterial, world.stones.length);
stonesMesh.instanceMatrix.setUsage(T.DynamicDrawUsage); stonesMesh.castShadow = true; stonesMesh.receiveShadow = true;
scene.add(stonesMesh);
const dummy = new T.Object3D(), colour = new T.Color();
const body = new T.Mesh(new T.SphereGeometry(1, 48, 24), new T.MeshPhysicalMaterial({ color: '#506b60', roughness: 0.4, clearcoat: 0.5 }));
body.scale.set(0.74, 0.018, 0.38); body.visible = false; scene.add(body);

// 觸手沿彎曲路徑伸向同一顆地面石頭，接觸後跟著石頭拉回身前。
const tentacleSegments = 14;
const tentacleMaterial = new T.MeshStandardMaterial({ color: '#70bfa5', roughness: 0.32, emissive: '#183a32', emissiveIntensity: 0.35 });
const tentacles = new T.InstancedMesh(new T.CylinderGeometry(1, 1, 1, 7), tentacleMaterial, 4 * tentacleSegments);
tentacles.instanceMatrix.setUsage(T.DynamicDrawUsage); tentacles.frustumCulled = false;
tentacles.castShadow = true; scene.add(tentacles);
const tips = new T.InstancedMesh(new T.SphereGeometry(1, 10, 8), tentacleMaterial, 4);
tips.frustumCulled = false; scene.add(tips);
const tentacleDummy = new T.Object3D(), up = new T.Vector3(0, 1, 0);
function syncTentacles() {
  const a = world.agent;
  const active = world.stones.filter(s => s.grab).slice(0, 4);
  tentacles.count = active.length * tentacleSegments; tips.count = active.length;
  active.forEach((stone, arm) => {
    const side = stone.grab.side >= 0 ? 0.34 : -0.34;
    const start = new T.Vector3(a.x + Math.cos(a.angle) * 0.43 - Math.sin(a.angle) * side, 0.14, a.z + Math.sin(a.angle) * 0.43 + Math.cos(a.angle) * side);
    const contact = stonePosition(world, stone);
    const target = new T.Vector3(contact.x, contact.y + 0.065, contact.z);
    const reach = Math.min(1, stone.grab.age / stone.grab.duration / 0.42);
    const ease = reach * reach * (3 - 2 * reach);
    const end = start.clone().lerp(target, ease);
    const control = start.clone().lerp(end, 0.5);
    control.y += 0.32 + Math.sin(world.time * 2 + arm) * 0.025;
    const curve = new T.QuadraticBezierCurve3(start, control, end);
    for (let j = 0; j < tentacleSegments; j++) {
      const p = curve.getPoint(j / tentacleSegments), q = curve.getPoint((j + 1) / tentacleSegments);
      const delta = q.clone().sub(p), length = delta.length();
      tentacleDummy.position.copy(p).add(q).multiplyScalar(0.5);
      tentacleDummy.quaternion.setFromUnitVectors(up, length > 0.00001 ? delta.divideScalar(length) : up);
      const radius = 0.048 * (1 - j / tentacleSegments * 0.55);
      tentacleDummy.scale.set(radius, Math.max(length, 0.0001), radius);
      tentacleDummy.updateMatrix(); tentacles.setMatrixAt(arm * tentacleSegments + j, tentacleDummy.matrix);
    }
    tentacleDummy.position.copy(end); tentacleDummy.quaternion.identity(); tentacleDummy.scale.set(0.055, 0.035, 0.055);
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
let nextTrail = 0, nextField = 0, nextUI = 0;
function syncScene() {
  const a = world.agent;
  body.position.set(a.x, 0.067, a.z); body.rotation.y = -a.angle;
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
    if (s.patch >= 0) colour.setHSL(0.16, 0.12 + s.water * 0.025, 0.40 + s.shade * 0.12, T.SRGBColorSpace);
    else colour.setHSL(0.11 + s.shade * 0.035, 0.05 + s.shade * 0.05, 0.35 + s.shade * 0.23, T.SRGBColorSpace);
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
  $('water-value').textContent = world.absorbed.toFixed(2);
  $('event').textContent = world.event;
  $('time').textContent = `${String(Math.floor(world.time / 60)).padStart(2, '0')}:${String(Math.floor(world.time % 60)).padStart(2, '0')}`;
  $('state-label').textContent = paused ? '觀察已暫停' : world.settings.sensing ? '循濕反應開啟' : '對照：循濕反應關閉';
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
  camera.zoom = following ? 2.15 : 1;
  if (!following) { controls.target.set(0, 0, 0); camera.position.set(0, 18, 13); }
  camera.updateProjectionMatrix(); syncScene();
};
$('reset').onclick = () => {
  world = createWorld(); paused = false; accumulator = 0; trailPoints.length = 0;
  nextTrail = nextField = nextUI = 0;
  world.settings.sensing = $('sensing').checked;
  world.settings.sensitivity = Number($('sensitivity').value);
  world.settings.irregularity = Number($('irregularity').value);
  $('pause').textContent = '暫停'; syncScene(); drawField(); updateUI();
};
$('moisture').onchange = e => {
  field.visible = e.target.checked; $('legend').hidden = !field.visible;
  markers.forEach(m => { m.visible = field.visible || editing; }); drawField();
};
$('sensors').onchange = e => { sensorGroup.visible = e.target.checked; };
$('reveal').onchange = e => {
  body.visible = e.target.checked;
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
resize(); syncScene(); drawField(); updateUI();
renderer.setAnimationLoop(now => {
  const dt = Math.min((now - last) / 1000, 0.1); last = now;
  if (!paused) {
    accumulator += dt * playback;
    while (accumulator >= 1 / 60) { stepWorld(world, 1 / 60); accumulator -= 1 / 60; }
    syncScene();
  }
  controls.update();
  if (now >= nextUI) { updateUI(); nextUI = now + 120; }
  renderer.render(scene, camera);
});
