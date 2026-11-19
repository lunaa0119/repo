// 直接錄製觀察室的 WebGL 畫布，無字幕、文字、音訊或生成影片。
export async function startFilm({ renderer, camera, controls, createWorld, createScenario, getWorld,
  setWorld, syncScene, renderScene, totalWater, restore }) {
  if (!globalThis.MediaRecorder || !renderer.domElement.captureStream) throw new Error('此瀏覽器不支援畫布錄影');
  const mime = ['video/mp4;codecs=avc1.42001E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm']
    .find(type => MediaRecorder.isTypeSupported(type));
  if (!mime) throw new Error('此瀏覽器沒有可用的錄影格式');
  const local = new URLSearchParams(location.search).has('save-local');
  const frames = [2, 9, 15, 20, 26, 31, 38, 43, 48, 51];
  const checkpoints = [], pending = [], duration = 52;
  renderer.setPixelRatio(1); renderer.setSize(1280, 720, false);
  const stream = renderer.domElement.captureStream(30);
  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6500000 });
  const chunks = [];
  let start, chapter = -1, finished = false, stopped = false;
  const originalWorld = getWorld();
  camera.zoom = 1; camera.top = 1.55; camera.bottom = -1.55;
  camera.left = -1.55 * 16 / 9; camera.right = 1.55 * 16 / 9; camera.updateProjectionMatrix();
  controls.enabled = false;

  function sceneFor(index) {
    if (index === 0) {
      const w = createWorld(); w.settings.sunlight = 0.15; return w;
    }
    if (index === 1) return createScenario('division');
    if (index === 2) {
      const w = createWorld();
      w.atmosphere += w.groundWater; w.groundWater = 0;
      for (const s of w.stones) { w.atmosphere += s.water; s.water = 0; }
      w.atmosphere += w.agent.water - 112; w.agent.water = 112;
      w.settings.sunlight = 1; return w;
    }
    const w = getWorld(); w.settings.rain = true; w.settings.sunlight = 0.1; return w;
  }
  function updateChapter(t) {
    const next = t < 12 ? 0 : t < 27 ? 1 : t < 41 ? 2 : 3;
    if (next === chapter) return;
    chapter = next; setWorld(sceneFor(chapter));
    document.getElementById('record-status').textContent = `錄製中 ${Math.floor(t)} / ${duration} 秒`;
  }
  function aim(t) {
    const w = getWorld();
    const a = w.agent, children = w.agents.filter(x => x.id !== a.id);
    const center = children.length ? { x: (a.x + children[0].x) / 2, z: (a.z + children[0].z) / 2 } : a;
    const spread = children.length ? Math.min(2, Math.hypot(a.x - children[0].x, a.z - children[0].z) * 0.22) : 0;
    const extent = 1.55 + spread;
    camera.top = extent; camera.bottom = -extent; camera.left = -extent * 16 / 9; camera.right = extent * 16 / 9;
    camera.updateProjectionMatrix();
    camera.position.set(center.x + 3, 6.5, center.z + 7); camera.lookAt(center.x, 0.06, center.z);
  }
  function send(kind, data, contentType) {
    return fetch(`/__recording/${kind}`, { method: 'POST', headers: { 'Content-Type': contentType, 'X-Stone-Mu-Recording': '1' }, body: data })
      .then(async response => { if (!response.ok) throw new Error(await response.text()); return response.json(); });
  }
  recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
  recorder.onerror = event => { document.getElementById('record-status').textContent = `錄製失敗：${event.error?.message ?? '編碼器錯誤'}`; };
  recorder.onstop = async () => {
    finished = true; stream.getTracks().forEach(track => track.stop());
    const blob = new Blob(chunks, { type: mime }), extension = mime.includes('mp4') ? 'mp4' : 'webm';
    try {
      let saved;
      if (local) {
        await Promise.all(pending);
        saved = await send('video', blob, mime);
        await send('metadata', JSON.stringify({ mime, extension, duration, width: 1280, height: 720,
          bytes: blob.size, noText: true, noAudio: true, checkpoints }), 'application/json');
      } else {
        const url = URL.createObjectURL(blob), a = document.createElement('a');
        a.href = url; a.download = `石殻姆-活動與環境展示.${extension}`; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      }
      document.getElementById('record-status').textContent = `已完成 ${duration} 秒無字影片 · ${extension.toUpperCase()}${saved ? ' · 已儲存至桌面' : ''}`;
    } catch (error) {
      document.getElementById('record-status').textContent = `影片儲存失敗：${error.message}`;
    } finally { setWorld(originalWorld); restore(); }
  };
  updateChapter(0); syncScene(); aim(0); renderScene();
  recorder.start(1000);
  return {
    frame(now) {
      if (finished) return false;
      start ??= now;
      const t = (now - start) / 1000;
      if (t >= duration) {
        if (!stopped) { stopped = true; recorder.stop(); }
        return true;
      }
      updateChapter(t); aim(t);
      document.getElementById('record-status').textContent = `錄製中 ${Math.floor(t)} / ${duration} 秒`;
      return true;
    },
    capture(now) {
      if (start === undefined || stopped) return;
      const t = (now - start) / 1000;
      if (frames.length && t >= frames[0]) {
        const second = frames.shift(), w = getWorld();
        checkpoints.push({ second, chapter, births: w.births, waterTotal: totalWater(w),
          agents: w.agents.map(a => ({ id: a.id, x: a.x, z: a.z, water: a.water, phase: a.phase })) });
        if (local) pending.push(new Promise((resolve, reject) => renderer.domElement.toBlob(blob => {
          if (!blob) return reject(new Error('無法擷取檢查影格'));
          send(`frame-${second}`, blob, 'image/png').then(resolve, reject);
        }, 'image/png')));
      }
    },
  };
}
