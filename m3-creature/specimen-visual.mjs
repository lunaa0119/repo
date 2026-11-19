import * as T from 'three';

// 材質與造型只負責呈現；反光色是觀察光線，不是新增生物發光能力。
export function createSpecimenRenderer(scene, renderer) {
  const room = new T.Scene(); room.background = new T.Color('#202830');
  for (const [x, y, z, color, width, height] of [
    [0, 6, -4, '#e7fff9', 10, 5], [-5, 2, 2, '#a4e7e4', 3, 7], [5, 3, -3, '#e6a0ca', 3, 7],
  ]) {
    const light = new T.Mesh(new T.PlaneGeometry(width, height), new T.MeshBasicMaterial({ color, side: T.DoubleSide }));
    light.position.set(x, y, z); light.lookAt(0, 0, 0); room.add(light);
  }
  const pmrem = new T.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(room, 0);
  scene.environment = environment.texture;
  pmrem.dispose();
  room.traverse(object => { object.geometry?.dispose(); object.material?.dispose(); });

  const geometry = new T.SphereGeometry(1, 48, 24);
  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), z = positions.getZ(i), angle = Math.atan2(z, x);
    const ripple = 1 + 0.06 * Math.sin(angle * 5) + 0.035 * Math.sin(angle * 9);
    positions.setX(i, x * ripple); positions.setZ(i, z * ripple);
  }
  geometry.computeVertexNormals();
  const membrane = new T.MeshPhysicalMaterial({
    color: '#cfbdd9', roughness: 0.12, metalness: 0, transmission: 0.4, thickness: 0.15,
    ior: 1.36, clearcoat: 1, clearcoatRoughness: 0.12, iridescence: 0.32,
    iridescenceIOR: 1.25, iridescenceThicknessRange: [100, 300], envMapIntensity: 2.4,
  });
  const fluid = new T.MeshPhysicalMaterial({ color: '#756381', roughness: 0.3,
    clearcoat: 0.8, transparent: true, opacity: 0.5, depthWrite: false });
  const views = new Map();
  function mesh(material) { const m = new T.Mesh(geometry, material); m.castShadow = true; return m; }
  function getView(id) {
    if (views.has(id)) return views.get(id);
    const group = new T.Group();
    const body = mesh(membrane), core = mesh(fluid), lobe = mesh(membrane), neck = mesh(membrane);
    group.add(body, core, lobe, neck); scene.add(group);
    const view = { group, body, core, lobe, neck, shownScale: null };
    views.set(id, view); return view;
  }
  return {
    sync(world) {
      for (const [id, view] of views) view.group.visible = world.agents.some(a => a.id === id);
      for (const a of world.agents) {
        const v = getView(a.id); v.group.visible = true;
        v.shownScale ??= a.scale;
        v.shownScale += (a.scale - v.shownScale) * 0.15;
        const s = v.shownScale, dormant = a.phase === 'dormant';
        v.group.position.set(a.x, dormant ? 0.065 : 0.073, a.z);
        v.group.rotation.y = -a.angle;
        const pulse = dormant ? 1 : 1 + 0.024 * Math.sin(world.time * 2.6 + a.id);
        v.body.scale.set(0.85 * s * pulse, (dormant ? 0.12 : 0.036) * s, 0.48 * s / pulse);
        v.core.scale.set(0.74 * s * pulse, 0.016 * s, 0.39 * s / pulse);
        v.core.position.y = -0.006;
        v.lobe.visible = v.neck.visible = Boolean(a.division);
        if (a.division) {
          const p = Math.min(1, a.division.age / a.division.duration), reach = 0.35 + p;
          v.lobe.position.set(0, 0, reach * s);
          v.lobe.scale.set(0.46 * p * s, 0.035 * s, 0.32 * p * s);
          v.neck.position.set(0, 0, reach * s * 0.48);
          v.neck.scale.set((0.32 * (1 - p) + 0.045) * s, 0.025 * s, reach * s * 0.65);
        }
      }
    },
  };
}
