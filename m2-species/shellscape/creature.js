// 1. Three.js 建立觀察室；Tweakpane 管理操作參數。
import * as T from 'three';
import {OrbitControls} from '../vendor/OrbitControls.js';
import {Pane} from './vendor/tweakpane.js';
import {GLTFExporter} from './vendor/GLTFExporter.js';
const $=s=>document.querySelector(s),params={動作:'搬運前進',速度:.75,外殼開合:0,雨季:false,霧濃度:.028,光線:2.8,自動環視:false};
const scene=new T.Scene();scene.background=new T.Color('#121b1a');scene.fog=new T.FogExp2('#343047',params.霧濃度);
const camera=new T.PerspectiveCamera(37,innerWidth/innerHeight,.1,90);camera.position.set(7.8,5.1,9.2);
const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,1.8));renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;$('#stage').append(renderer.domElement);
const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,.65,0);controls.enableDamping=true;controls.minDistance=3.2;controls.maxDistance=19;controls.maxPolarAngle=Math.PI*.49;
scene.add(new T.HemisphereLight('#b3c6d4','#252620',1.5));const sun=new T.DirectionalLight('#e8dfbb',params.光線);sun.position.set(3,8,4);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-8;sun.shadow.camera.right=8;sun.shadow.camera.top=8;sun.shadow.camera.bottom=-8;sun.shadow.bias=-.0004;scene.add(sun);const rim=new T.DirectionalLight('#b5b9ed',2.2);rim.position.set(-4,4,-6);scene.add(rim);const fill=new T.PointLight('#8bcbad',6,10);fill.position.set(-1,1.5,1);scene.add(fill);
let seed=415;function rand(){seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;}const range=(a,b)=>a+rand()*(b-a);
const mat=(color,roughness=.8,metalness=0)=>new T.MeshStandardMaterial({color,roughness,metalness});
// 2. 可重現的表面紋理，區分混凝土、陶片與濕潤薄膜。
function texture(base){const c=document.createElement('canvas');c.width=c.height=256;let x=c.getContext('2d');x.fillStyle=base;x.fillRect(0,0,256,256);for(let i=0;i<13000;i++){const g=rand()>.5?230:22;x.fillStyle=`rgba(${g},${g},${g},${range(.03,.14)})`;const s=range(.4,2.1);x.fillRect(rand()*256,rand()*256,s,s);}for(let i=0;i<8;i++){x.strokeStyle='rgba(15,22,19,.35)';x.lineWidth=.8;x.beginPath();let px=rand()*256,py=rand()*256;x.moveTo(px,py);for(let j=0;j<9;j++){px+=range(-14,14);py+=range(4,14);x.lineTo(px,py);}x.stroke();}const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;return t;}
const concrete=new T.MeshStandardMaterial({map:texture('#a2a08d'),roughness:.96,bumpMap:texture('#888888'),bumpScale:.035});
const ceramic=new T.MeshStandardMaterial({map:texture('#91aaa0'),roughness:.32,metalness:.08});const rust=mat('#76503d',.9,.45);const stone=mat('#626960');
const flesh=new T.MeshPhysicalMaterial({color:'#739e8a',roughness:.28,metalness:.04,clearcoat:.65,clearcoatRoughness:.3,transparent:true,opacity:.88,side:T.DoubleSide});
const veinMat=new T.MeshStandardMaterial({color:'#b4d5ac',emissive:'#41614b',emissiveIntensity:.3,roughness:.45});const tendonMat=mat('#b4b6a1',.35);
const creature=new T.Group();creature.name='BorrowedLandscape';scene.add(creature);
function mesh(geo,m,parent=creature){const o=new T.Mesh(geo,m);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;}
// 活體是一片薄而多皺的連續膜，沒有眼睛、頭或四肢。
const membraneGeo=new T.SphereGeometry(1,80,48);const bp=membraneGeo.attributes.position;for(let i=0;i<bp.count;i++){let x=bp.getX(i),y=bp.getY(i),z=bp.getZ(i);const n=1+.06*Math.sin(x*21+z*9)*Math.cos(z*17+y*12)+.055*Math.sin(Math.atan2(z,x)*11)*(1-y*y);bp.setXYZ(i,x*2.15*n,y*.46*n+.55,z*1.53*n);}membraneGeo.computeVertexNormals();const membrane=mesh(membraneGeo,flesh);membrane.name='LivingMembrane';
function tube(points,r,m,parent=creature){return mesh(new T.TubeGeometry(new T.CatmullRomCurve3(points),24,r,6,false),m,parent);}
const V=(x,y,z)=>new T.Vector3(x,y,z),veins=[];
for(let i=0;i<24;i++){const a=i/24*Math.PI*2,p=[];for(let j=0;j<=10;j++){const u=j/10;p.push(V(Math.cos(a+u*.22)*2.04*u,.59+.43*Math.sqrt(Math.max(0,1-u*u)),Math.sin(a+u*.22)*1.45*u));}const o=tube(p,.012,veinMat);veins.push(o);}
for(let i=0;i<13;i++){const a=range(0,Math.PI*2),r=range(.2,.9);const o=mesh(new T.SphereGeometry(range(.075,.14),18,12),new T.MeshPhysicalMaterial({color:i%3?'#82aa98':'#c5a962',roughness:.18,clearcoat:1,transparent:true,opacity:.85}));o.position.set(Math.cos(a)*r*1.7,.65+Math.sqrt(1-r*r)*.32,Math.sin(a)*r*1.2);o.scale.y=.7;}
// 3. 外殼由不同材質的碎片拼成，每片都有自己的牽引絲。
function shardGeo(size){const shape=new T.Shape(),count=5+Math.floor(rand()*3);for(let i=0;i<count;i++){const a=i/count*Math.PI*2,r=size*range(.66,1.12);if(!i)shape.moveTo(Math.cos(a)*r,Math.sin(a)*r);else shape.lineTo(Math.cos(a)*r,Math.sin(a)*r);}shape.closePath();const g=new T.ExtrudeGeometry(shape,{depth:range(.09,.18),bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.035,bevelThickness:.025});g.center();return g;}
const shards=[];
for(let i=0;i<34;i++){const a=i*2.39996,r=Math.sqrt((i+.5)/34),x=Math.cos(a)*r*2.2,z=Math.sin(a)*r*1.58,y=.66+.63*Math.sqrt(1-r*r);const g=new T.Group();creature.add(g);const slab=mesh(shardGeo(range(.27,.49)),i%7===0?rust:i%4===0?ceramic:concrete,g);slab.rotation.x=-Math.PI/2;slab.rotation.z=range(-.5,.5);slab.rotation.y=range(-.4,.4);const base=V(x,y,z);g.position.copy(base);g.rotation.set(range(-.3,.3),range(0,6.28),range(-.35,.35));const rot=g.rotation.clone();
if(i%5===0){const rod=tube([V(-.3,0,0),V(.05,.05,0),V(.48,.13,.03)],.018,rust,g);for(let k=0;k<5;k++){const o=mesh(new T.TorusGeometry(.024,.006,5,8),rust,g);o.position.set(-.15+k*.1,.03,0);o.rotation.y=Math.PI/2;}}
if(i%4===0){for(let k=0;k<3;k++){const peb=mesh(new T.IcosahedronGeometry(.025,0),stone,g);peb.position.set(range(-.25,.25),.11,range(-.2,.2));}}
shards.push({g,base,rot,a,index:i,phase:range(0,6.28)});}
// 牽引絲採有厚度的管狀網格，動態更新頂點而非每幀重建模型。
const filaments=[];
function strand(start,end,index){const geo=new T.BufferGeometry();const seg=20,sides=5,positions=new Float32Array((seg+1)*(sides+1)*3),indices=[];for(let j=0;j<seg;j++)for(let k=0;k<sides;k++){const q=j*(sides+1)+k;indices.push(q,q+sides+1,q+1,q+1,q+sides+1,q+sides+2);}geo.setAttribute('position',new T.BufferAttribute(positions,3));geo.setIndex(indices);const o=mesh(geo,index%3?tendonMat:veinMat);filaments.push({o,start,end,index,seg,sides});}
shards.forEach((s,i)=>{strand(s.base.clone().multiply(V(.78,0,.78)).setY(.52),()=>s.g.position.clone(),i);});
const feelers=[];for(let i=0;i<18;i++){const a=i/18*Math.PI*2;const b=V(Math.cos(a)*1.8,.3,Math.sin(a)*1.3),end=V(Math.cos(a)*range(2.5,3.15),.05,Math.sin(a)*range(1.9,2.6));feelers.push({b,end,a});strand(b,()=>end,i+34);}
function updateStrands(t){for(const f of filaments){const end=f.end(),start=f.start,pos=f.o.geometry.attributes.position;for(let j=0;j<=f.seg;j++){let u=j/f.seg;const p=start.clone().lerp(end,u);p.y+=Math.sin(u*Math.PI)*(.12+.06*Math.sin(t*1.8+f.index));p.x+=Math.sin(u*Math.PI*2+t+f.index)*.035*Math.sin(u*Math.PI);let tangent=end.clone().sub(start).normalize(),normal=new T.Vector3().crossVectors(tangent,V(0,1,0)).normalize();if(normal.lengthSq()<.1)normal.set(1,0,0);let binormal=new T.Vector3().crossVectors(tangent,normal);const radius=.016*(1-u*.55);for(let k=0;k<=f.sides;k++){const angle=k/f.sides*6.283;let pt=p.clone().addScaledVector(normal,Math.cos(angle)*radius).addScaledVector(binormal,Math.sin(angle)*radius);pos.setXYZ(j*(f.sides+1)+k,pt.x,pt.y,pt.z);}}pos.needsUpdate=true;f.o.geometry.computeVertexNormals();}}
// 濕土觀察台與周圍散落的遺物。
const floorMat=new T.MeshStandardMaterial({map:texture('#444b3b'),roughness:.9});const floor=mesh(new T.CylinderGeometry(6.1,6.1,.22,96),floorMat,scene);floor.position.y=-.19;
for(let i=0;i<95;i++){const a=range(0,6.28),r=range(3.15,5.9),o=mesh(new T.DodecahedronGeometry(range(.035,.15),0),i%7?stone:ceramic,scene);o.position.set(Math.cos(a)*r,-.035,Math.sin(a)*r);o.scale.y=range(.25,.7);o.rotation.set(rand()*3,rand()*3,rand()*3);}
const dustGeo=new T.BufferGeometry(),dustPos=new Float32Array(360*3);for(let i=0;i<360;i++){dustPos[i*3]=range(-9,9);dustPos[i*3+1]=range(.3,8);dustPos[i*3+2]=range(-9,9);}dustGeo.setAttribute('position',new T.BufferAttribute(dustPos,3));const dust=new T.Points(dustGeo,new T.PointsMaterial({color:'#b4c3b2',size:.018,transparent:true,opacity:.45}));scene.add(dust);
// 4. 控制面板與動作。這些是可調的展示軌跡，沒有宣稱物理模擬。
const pane=new Pane({container:$('#pane'),title:'生物觀察'});pane.addBinding(params,'動作',{options:{搬運前進:'搬運前進',靜止呼吸:'靜止呼吸',回收碎片:'回收碎片'}});pane.addBinding(params,'速度',{min:.1,max:1.6,step:.05});pane.addBinding(params,'外殼開合',{min:0,max:1,step:.01});pane.addBinding(params,'雨季');const env=pane.addFolder({title:'觀察光線',expanded:false});env.addBinding(params,'光線',{min:.5,max:5,step:.1});env.addBinding(params,'霧濃度',{min:0,max:.09,step:.001});env.addBinding(params,'自動環視');
let paused=false,time=0,last=performance.now(),opening=0;
const labels=['前緣抓取，牽引碎片','薄膜舒張，外殼移位','後緣鬆開，重新組殼'];
function animate(now){const dt=Math.min((now-last)/1000,.05);last=now;if(!paused)time+=dt*params.速度;opening=T.MathUtils.damp(opening,params.外殼開合,4,dt);const moving=params.動作!=='靜止呼吸',amplitude=moving?.1:.018;
creature.position.x=moving?Math.sin(time*.2)*.35:0;creature.rotation.y=moving?Math.sin(time*.14)*.05:0;membrane.scale.y=1+Math.sin(time*1.4)*.055;membrane.scale.z=1+Math.sin(time*1.4+.4)*.018;
for(const s of shards){const pulse=Math.sin(time*1.6+s.base.x*1.5+s.base.z),harvest=params.動作==='回收碎片'?Math.max(0,Math.sin(time*.8+s.phase))*.22:0;s.g.position.copy(s.base);s.g.position.x+=Math.cos(s.a)*opening*1.15+pulse*amplitude;s.g.position.z+=Math.sin(s.a)*opening*.95;s.g.position.y+=opening*(.35+Math.abs(s.base.x)*.16)+Math.max(0,pulse)*amplitude+harvest;s.g.rotation.copy(s.rot);s.g.rotation.z+=opening*Math.cos(s.a)*.55+Math.sin(time+s.phase)*amplitude*.4;
if(moving&&s.index%6===0&&opening<.1){const u=((time*.13+s.index*.17)%1),target=s.base.clone();if(u<.22){const v=u/.22;s.g.position.lerpVectors(V(3.1,.08,Math.sin(s.a)*1.2),target,v);s.g.position.y+=Math.sin(v*Math.PI)*.5;}else if(u>.78){const v=(u-.78)/.22;s.g.position.lerpVectors(target,V(-3.1,.08,Math.sin(s.a)*1.3),v);s.g.position.y+=Math.sin(v*Math.PI)*.3;}s.g.rotation.z+=Math.sin(u*Math.PI)*.25;}}

feelers.forEach((f,i)=>{f.end.y=.02+Math.max(0,Math.sin(time*1.7+i))*.1;f.end.x=Math.cos(f.a)*(2.7+Math.sin(time+i)*amplitude);});updateStrands(time);
scene.fog.density=params.霧濃度;sun.intensity=params.光線;flesh.roughness=params.雨季?.13:.28;dust.material.opacity=params.雨季?.65:.3;if(params.雨季&&!paused){for(let i=0;i<360;i++){dustPos[i*3+1]-=dt*3;if(dustPos[i*3+1]<0)dustPos[i*3+1]=8;}dustGeo.attributes.position.needsUpdate=true;}
controls.autoRotate=params.自動環視;controls.autoRotateSpeed=.55;controls.update();renderer.render(scene,camera);$('#action').textContent=params.動作==='靜止呼吸'?'外殼靜止，內膜持續收縮':labels[Math.floor(time/2)%3];$('#habitat').textContent=params.雨季?'雨季 / 外殼鬆開，內膜補充水分':'乾季 / 蓄水碎片維持內膜濕潤';}
renderer.setAnimationLoop(animate);
$('#pause').onclick=e=>{paused=!paused;e.target.textContent=paused?'繼續':'暫停';};$('#reveal').onclick=e=>{params.外殼開合=params.外殼開合>.5?0:1;pane.refresh();e.target.setAttribute('aria-pressed',params.外殼開合>.5);e.target.textContent=params.外殼開合>.5?'收回外殼':'打開外殼';};$('#focus').onclick=()=>{camera.position.set(7.8,5.1,9.2);controls.target.set(0,.65,0);params.自動環視=false;pane.refresh();controls.update();};
function download(blob,name){const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),30000);}
$('#capture').onclick=()=>{renderer.render(scene,camera);renderer.domElement.toBlob(b=>{if(b)download(b,'借殼地貌.png');});};
$('#export').onclick=async()=>{const b=$('#export');b.disabled=true;$('#status').textContent='正在匯出模型…';try{const result=await new GLTFExporter().parseAsync(creature,{binary:true,onlyVisible:true});download(new Blob([result],{type:'model/gltf-binary'}),'借殼地貌.glb');$('#status').textContent='已匯出目前姿態的 GLB；動作留在網頁中';}catch(e){$('#status').textContent='匯出失敗：'+e.message;console.error(e);}finally{b.disabled=false;}};
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});

// 5. 錄製包含各個動作的 52 秒示範，優先輸出 MP4，支援不足時改 WebM。
$('#record').onclick=()=>{
 const button=$('#record');
 if(!globalThis.MediaRecorder||!HTMLCanvasElement.prototype.captureStream){$('#status').textContent='請使用支援 MediaRecorder 的 Chrome 錄影。';return;}
 const candidates=['video/mp4;codecs=avc1.42001E','video/mp4','video/webm;codecs=vp9','video/webm'];
 const mime=candidates.find(t=>MediaRecorder.isTypeSupported(t));if(!mime){$('#status').textContent='此瀏覽器沒有可用的錄影格式。';return;}
 const output=document.createElement('canvas');output.width=1600;output.height=900;const ctx=output.getContext('2d');const stream=output.captureStream(30),rec=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:8000000}),chunks=[];
 const saved={...params},savedPaused=paused;paused=false;params.速度=.85;params.自動環視=false;time=0;controls.enabled=false;
 const previousPreview=document.querySelector('#video-preview');if(previousPreview)previousPreview.remove();
 button.disabled=true;button.textContent='錄影中…';let finished=false;
 rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
 rec.onerror=e=>{$('#status').textContent='錄影失敗，請重試。';console.error(e);};
 rec.onstop=()=>{finished=true;stream.getTracks().forEach(t=>t.stop());const blob=new Blob(chunks,{type:mime});const ext=mime.includes('mp4')?'mp4':'webm';download(blob,'借殼地貌-動作展示.'+ext);Object.assign(params,saved);paused=savedPaused;controls.enabled=true;pane.refresh();button.disabled=false;button.textContent='錄製動作影片';
 const preview=document.createElement('video');preview.id='video-preview';preview.controls=true;preview.muted=true;preview.playsInline=true;preview.src=URL.createObjectURL(blob);preview.style.cssText='position:fixed;left:24px;top:220px;width:min(520px,60vw);z-index:10;background:#101615;border:1px solid #9bad9a;border-radius:8px';preview.setAttribute('aria-label','已錄製的動作影片預覽');preview.onloadedmetadata=()=>{$('#status').textContent='影片已下載 · '+preview.videoWidth+' × '+preview.videoHeight+' · '+(Number.isFinite(preview.duration)?preview.duration.toFixed(1)+' 秒': '約 52 秒');};document.body.append(preview);preview.play().catch(()=>{});
 const close=document.createElement('button');close.textContent='關閉影片預覽';close.style.cssText='position:fixed;left:24px;top:184px;z-index:11';close.onclick=()=>{preview.pause();URL.revokeObjectURL(preview.src);preview.remove();close.remove();};document.body.append(close);
 };
 rec.start(1000);const start=performance.now(),ease=x=>{x=T.MathUtils.clamp(x,0,1);return x*x*(3-2*x);};
 function frame(now){if(finished)return;const t=(now-start)/1000;if(t>=52){rec.stop();return;}
 let title,sub;
 if(t<12){params.動作='搬運前進';params.外殼開合=0;params.雨季=false;title='01　搬運前進';sub='牽引絲固定碎片，薄膜帶動整片外殼';}
 else if(t<21){params.動作='回收碎片';params.外殼開合=0;title='02　碎片回收';sub='前緣抓入新碎片，後緣逐漸放開';}
 else if(t<28){params.動作='靜止呼吸';params.外殼開合=0;title='03　內膜舒張';sub='外殼暫停搬運，內膜保持緩慢收縮';}
 else if(t<38){params.動作='靜止呼吸';params.外殼開合=ease((t-28)/3);title='04　外殼展開';sub='觀察碎片下方的連續薄膜、管脈與牽引絲';}
 else if(t<46){params.動作='回收碎片';params.雨季=true;params.外殼開合=1;title='05　雨季補水';sub='外殼鬆開，濕潤內膜接觸雨水';}
 else{params.動作='靜止呼吸';params.雨季=false;params.外殼開合=1-ease((t-46)/3);title='06　重新組殼';sub='碎片收回身體上方，形成保護結構';}
 const az=.62+Math.sin(t/52*Math.PI*1.25)*.65;const distance=t>=28&&t<46?10.5:11.8;camera.position.set(Math.sin(az)*distance,t>=28&&t<46?5.5:4.7,Math.cos(az)*distance);controls.target.set(0,.65,0);camera.lookAt(controls.target);
 if(t<12)creature.position.x=-1.15+2.3*ease(t/12);else creature.position.x=1.15*(1-ease((t-12)/2));
 renderer.render(scene,camera);ctx.fillStyle='#121b1a';ctx.fillRect(0,0,1600,900);const source=renderer.domElement,scale=Math.min(1600/source.width,730/source.height),w=source.width*scale,h=source.height*scale;ctx.drawImage(source,(1600-w)/2,72,w,h);
 ctx.fillStyle='#d3dfcb';ctx.font='500 32px "PingFang TC",sans-serif';ctx.fillText('借殼地貌 / '+title,42,47);ctx.font='25px "PingFang TC",sans-serif';ctx.fillStyle='#e7e7db';ctx.fillText(sub,42,828);ctx.font='18px "PingFang TC",sans-serif';ctx.fillStyle='#9dad9f';ctx.fillText('科幻生物動作展示 · 動作為預設軌跡，雨季時間已縮短',42,865);ctx.fillStyle='#bdd6b0';ctx.fillRect(0,895,1600*t/52,5);$('#status').textContent='錄影中 '+Math.floor(t)+' / 52 秒';requestAnimationFrame(frame);
 }requestAnimationFrame(frame);
};
