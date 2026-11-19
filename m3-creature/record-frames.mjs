// 同一個 WebGL 場景逐格匯出，避免 Chrome 遮擋視窗時將錄影降到 1 fps。
export async function exportFilmFrames({ renderer, camera, controls, createWorld, createScenario,
  getWorld, setWorld, syncScene, renderScene, stepWorld, updateUI, totalWater }) {
  const fps = 24, duration = 52, frames = fps * duration;
  const checkpoints = [], samples = new Set([2, 9, 15, 20, 26, 31, 38, 43, 48, 51]);
  const status = document.getElementById('record-status');
  renderer.setPixelRatio(1); renderer.setSize(1280, 720, false);
  controls.enabled = false; camera.zoom = 1;
  let chapter = -1, accumulator = 0;
  const send = async (kind, body, contentType) => {
    const response = await fetch(`/__recording/${kind}`, { method: 'POST',
      headers: { 'Content-Type': contentType, 'X-Stone-Mu-Recording': '1' }, body });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  };
  for (let frame = 0; frame < frames; frame++) {
    const t = frame / fps, next = t < 12 ? 0 : t < 27 ? 1 : t < 41 ? 2 : 3;
    if (next !== chapter) {
      chapter = next; accumulator = 0;
      if (chapter === 0) { const w = createWorld(); w.settings.sunlight = 0.15; setWorld(w); }
      else if (chapter === 1) setWorld(createScenario('division'));
      else if (chapter === 2) {
        const w = createWorld(); w.atmosphere += w.groundWater; w.groundWater = 0;
        for (const stone of w.stones) { w.atmosphere += stone.water; stone.water = 0; }
        w.atmosphere += w.agent.water - 112; w.agent.water = 112; w.settings.sunlight = 1; setWorld(w);
      } else { getWorld().settings.rain = true; getWorld().settings.sunlight = 0.1; }
    }
    const w = getWorld();
    accumulator += 1 / fps;
    while (accumulator >= 1 / 60) { stepWorld(w, 1 / 60); accumulator -= 1 / 60; }
    syncScene(); updateUI();
    const a = w.agent, child = w.agents[1];
    const center = child ? { x: (a.x + child.x) / 2, z: (a.z + child.z) / 2 } : a;
    const extent = 1.55 + (child ? Math.min(2, Math.hypot(a.x - child.x, a.z - child.z) * 0.22) : 0);
    camera.top = extent; camera.bottom = -extent;
    camera.left = -extent * 16 / 9; camera.right = extent * 16 / 9; camera.updateProjectionMatrix();
    camera.position.set(center.x + 3, 6.5, center.z + 7); camera.lookAt(center.x, 0.06, center.z);
    renderScene();
    // toBlob 在被遮擋的 Chrome 視窗會等待閒置任務；同步讀取避免降成 1 fps。
    const encoded = renderer.domElement.toDataURL('image/jpeg', 0.92).split(',')[1];
    const binary = atob(encoded), bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const jpeg = new Blob([bytes], { type: 'image/jpeg' });
    await send(`jpeg-${String(frame).padStart(5, '0')}`, jpeg, 'image/jpeg');
    if (frame % fps === 0) {
      status.textContent = `匯出無字影片影格 ${frame} / ${frames}`;
      if (samples.has(t)) checkpoints.push({ second: t, chapter, births: w.births, waterTotal: totalWater(w),
        agents: w.agents.map(x => ({ id: x.id, x: x.x, z: x.z, water: x.water, phase: x.phase })) });
    }
  }
  await send('frames-metadata', JSON.stringify({ duration, fps, frames, width: 1280, height: 720,
    noText: true, noAudio: true, checkpoints }), 'application/json');
  status.textContent = `已匯出 ${frames} 格無字畫面，準備合成 MP4`;
}
