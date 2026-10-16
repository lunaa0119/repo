// 1. 場景、鏡頭與燈光：把模型放進瀏覽器中的 3D 空間。
import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';
const view=document.querySelector('#view'),phase=document.querySelector('#phase');
const scene=new THREE.Scene();scene.background=new THREE.Color('#22232d');scene.fog=new THREE.FogExp2('#51405e',.024);
const camera=new THREE.PerspectiveCamera(42,innerWidth/innerHeight,.1,100);camera.position.set(12,9,16);
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(innerWidth,innerHeight);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;view.append(renderer.domElement);
const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(1,0,0);controls.enableDamping=true;controls.maxPolarAngle=Math.PI*.47;controls.minDistance=5;controls.maxDistance=26;
scene.add(new THREE.HemisphereLight(0xd2e4ff,0x46432b,2.4));const light=new THREE.DirectionalLight(0xffe4bc,3);light.position.set(4,10,6);light.castShadow=true;light.shadow.mapSize.set(2048,2048);light.shadow.camera.left=-14;light.shadow.camera.right=14;light.shadow.camera.top=14;light.shadow.camera.bottom=-14;scene.add(light);
const mat=(color,roughness=.85)=>new THREE.MeshStandardMaterial({color,roughness});
const shellMat=mat(0x697d61),skinMat=mat(0xb4ba83),darkMat=mat(0x24342b),eyeMat=mat(0x171c19,.35);
function sphere(parent,r,m,pos,scale=[1,1,1]){const mesh=new THREE.Mesh(new THREE.SphereGeometry(r,32,24),m);mesh.position.set(...pos);mesh.scale.set(...scale);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;}
// 2. 土地與河流：只是動作展示場地，沒有把整個世界縮成實際尺度。
const ground=new THREE.Mesh(new THREE.BoxGeometry(11,.4,11),mat(0x4c4b3d));ground.position.set(-2,-.2,0);ground.receiveShadow=true;scene.add(ground);
const bed=new THREE.Mesh(new THREE.BoxGeometry(5,.3,11),mat(0x536264));bed.position.set(7,-3.05,0);bed.receiveShadow=true;scene.add(bed);
const ramp=new THREE.Mesh(new THREE.BoxGeometry(3.6,.15,10.5),mat(0x4c4b3d));ramp.position.set(4.5,-1.5,0);ramp.rotation.z=-Math.atan(1.5);ramp.receiveShadow=true;scene.add(ramp);
const water=new THREE.Mesh(new THREE.PlaneGeometry(5,11),new THREE.MeshStandardMaterial({color:0x568c92,transparent:true,opacity:.26,roughness:.3,depthWrite:false,side:THREE.DoubleSide}));water.rotation.x=-Math.PI/2;water.position.set(7,.3,0);scene.add(water);
for(let i=0;i<18;i++){let x=-8+(i*2.731)%11,z=-4.2+(i%3)*.35;const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.18,.3,3.7,8),mat(0x554e44));trunk.position.set(x,1.85,z);trunk.castShadow=true;scene.add(trunk);sphere(scene,1.2,mat(0x354b40),[x,4,z],[1,1.6,1]);}
for(let i=0;i<28;i++)sphere(scene,.09+(i%4)*.025,mat(0x77746a),[-8+(i*1.73)%11,.07,-3.7+(i*.91)%7.4],[1,.6,1]);
const rainGeo=new THREE.BufferGeometry(),rainPos=new Float32Array(240*3);for(let i=0;i<240;i++){rainPos[i*3]=-8+(i*1.91)%18;rainPos[i*3+1]=(i*.73)%8;rainPos[i*3+2]=-5+(i*1.27)%10;}rainGeo.setAttribute('position',new THREE.BufferAttribute(rainPos,3));const rain=new THREE.Points(rainGeo,new THREE.PointsMaterial({color:0xb0cbd8,size:.05,transparent:true,opacity:.7}));scene.add(rain);rain.visible=false;
// 3. 身體部位分開：收球時把頭與手腳移入殼內，不只把模型換成球。
const root=new THREE.Group(),roll=new THREE.Group();scene.add(root);root.add(roll);
sphere(roll,1,shellMat,[0,0,0]);
// 殼上的溝槽，讓滾動角度容易觀察。
for(let i=0;i<8;i++){const line=new THREE.Mesh(new THREE.TorusGeometry(1.008,.016,6,72),darkMat);line.rotation.y=i*Math.PI/8;roll.add(line);}
const head=new THREE.Group();roll.add(head);sphere(head,.32,skinMat,[0,0,0],[1,.95,1.1]);sphere(head,.07,eyeMat,[-.15,.08,.27]);sphere(head,.07,eyeMat,[.15,.08,.27]);
const hands=[],feet=[];
for(const side of [-1,1]){const hand=sphere(roll,.22,skinMat,[side*.97,-.15,.05],[.7,1.1,.8]);hands.push(hand);const foot=sphere(roll,.25,skinMat,[side*.37,-.95,.12],[.8,.7,1.3]);feet.push(foot);
const socket=sphere(roll,.235,darkMat,[side*.89,-.15,.05],[.2,1.15,.9]);}
sphere(roll,.31,darkMat,[0,.35,.87],[1,1,.18]);
let tail;
function tailShape(curl,t){if(tail){roll.remove(tail);tail.geometry.dispose();}const points=[];for(let i=0;i<=12;i++){let u=i/12;if(curl>.5){let a=u*2.9;points.push(new THREE.Vector3(-Math.sin(a)*1.025,-.2+u*.22,-Math.cos(a)*1.025));}else points.push(new THREE.Vector3(Math.sin(u*3+t)*.16*u,-.2-u*.18,-.85-u*1.3));}tail=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),24,.045,7,false),skinMat);roll.add(tail);}
function pose(curl,handCurl=curl,footCurl=curl,t=0){head.position.set(0,.35*(1-curl),.99-.8*curl);head.scale.setScalar(1-.35*curl);hands.forEach((h,i)=>{h.position.x=(i?1:-1)*(.99-.7*handCurl);h.scale.setScalar(1-.6*handCurl);});feet.forEach((f,i)=>{f.position.set((i?1:-1)*.37,-.94+.65*footCurl,.16);f.scale.set(1,1,1);});tailShape(curl,t);}
const clamp=x=>Math.max(0,Math.min(1,x)),smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
let mode='land',paused=false,time=0,last=performance.now(),speed=1;
function land(t){const c=t%11;root.position.set(-5,1.12,0);roll.rotation.set(0,0,0);let curl=0,handsC=0,feetC=0,label='站立';
if(c<1.2){root.position.y-=.18*Math.sin(c/1.2*Math.PI/2);label='屈腿蓄力';}
else if(c<2.1){let u=(c-1.2)/.9;root.position.x=-5+1.4*u;root.position.y=1.12+1.1*Math.sin(u*Math.PI);curl=smooth((u-.12)/.6);handsC=smooth(u*4);feetC=curl;label='向前跳，空中收球';}
else if(c<6.5){let u=(c-2.1)/4.4;root.position.set(-3.6+7*u,1,Math.sin(u*Math.PI)*.6);roll.rotation.x=7*u;roll.rotation.y=-u*.3;curl=handsC=feetC=1;label='球形滾動，重心轉彎';}
else if(c<8){let u=(c-6.5)/1.5;root.position.set(3.4+.6*(1-(1-u)**3),1,-.65*u);roll.rotation.x=7+.6*(1-(1-u)**3);roll.rotation.z=.5*Math.sin(u*Math.PI/2);curl=handsC=feetC=1;label='維持球形側煞';}
else{let u=c-8;root.position.set(4,1+.12*smooth(u/.7),-.65);roll.rotation.set(0,0,.5*(1-smooth(u/.7)));feetC=1-smooth(u/.7);curl=handsC=1-smooth((u-.7)/.8);label=u<.7?'先伸腳站穩':'伸出頭與手';}pose(curl,handsC,feetC,t);phase.textContent=label;}
function underwater(t,x=7){const c=t%10;root.position.set(x,-1.85,0);roll.rotation.set(0,0,0);pose(0,1,0,t);if(c<5){let u=(c%1.7)/1.7;root.position.y+=.45*Math.sin(u*Math.PI);root.position.z=-1.5+3*(c/5);phase.textContent='雙腳蹬河床，向前跳';}else if(c<7){let u=(c-5)/2;root.position.y=-1.85+1.95*smooth(u);feet.forEach(f=>f.rotation.x=Math.sin(t*12)*.55);phase.textContent='雙腳划水上浮';}else if(c<8){root.position.y=.1;phase.textContent='水面換氣';}else{root.position.y=.1-1.95*smooth((c-8)/2);feet.forEach(f=>f.rotation.x=0);phase.textContent='停止划水，慢慢下沉';}}
function season(t){const c=t%26;rain.visible=c<18;roll.rotation.set(0,0,0);if(c<4){root.position.set(-4,1.12,0);pose(0,0,0,t);phase.textContent='持續淋雨，等待入河';}else if(c<9){let u=(c-4)/5,x=-4+11*u;root.position.set(x,1.12-2.97*clamp((x-3.5)/2),0);roll.rotation.x=11*u;pose(1,1,1,t);phase.textContent='成球滾入河裡';}else if(c<18){underwater(c-9);phase.textContent+=' · 雨季浸泡補水';}else if(c<21){underwater(c-9);phase.textContent='雨停，等待擾動消失';}else{let u=(c-21)/5,x=7-4.5*u;root.position.set(x,1.12-2.97*clamp((x-3.5)/2),0);pose(0,1-smooth(u),0,t);feet.forEach((f,i)=>f.rotation.x=Math.sin(t*9+i*Math.PI)*.3);phase.textContent=u<.55?'沿河床跳到岸邊':'雙腳走上岸';}}
function draw(now){const dt=Math.min((now-last)/1000,.05);last=now;if(!paused)time+=dt*speed;feet.forEach(f=>f.rotation.x=0);rain.visible=mode==='season';if(mode==='land')land(time);else if(mode==='water')underwater(time);else season(time);if(rain.visible){for(let i=0;i<240;i++){rainPos[i*3+1]-=paused?0:dt*6;if(rainPos[i*3+1]<0)rainPos[i*3+1]=8;}rainGeo.attributes.position.needsUpdate=true;}controls.update();renderer.render(scene,camera);}
renderer.setAnimationLoop(draw);
document.querySelector('#timeline').oninput=e=>{const duration=mode==='land'?11:mode==='water'?10:26;time=Number(e.target.value)/100*duration;paused=true;document.querySelector('#pause').textContent='繼續';};
document.querySelector('#mode').onchange=e=>{mode=e.target.value;time=0;};document.querySelector('#pause').onclick=e=>{paused=!paused;e.target.textContent=paused?'繼續':'暫停';};document.querySelector('#reset').onclick=()=>{time=0;};document.querySelector('#speed').oninput=e=>speed=Number(e.target.value);
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});

// 4. 將三段動作錄成影片；使用瀏覽器原生 MediaRecorder，不需要上傳。
const recordButton=document.querySelector('#record');
recordButton.onclick=()=>{
 if(!globalThis.MediaRecorder || !HTMLCanvasElement.prototype.captureStream){phase.textContent='此瀏覽器不支援錄影，請用 Chrome。';return;}
 const output=document.createElement('canvas');output.width=1280;output.height=720;
 const ctx=output.getContext('2d'),stream=output.captureStream(30);
 const mime=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(x=>MediaRecorder.isTypeSupported(x));
 const recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:6000000});const chunks=[];
 const old={mode,time,paused,speed};paused=true;recordButton.disabled=true;recordButton.textContent='錄製中…';
 camera.position.set(12,9,16);controls.target.set(1,0,0);controls.update();
 recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
 recorder.onstop=()=>{stream.getTracks().forEach(t=>t.stop());const blob=new Blob(chunks,{type:mime});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='森林生物-3D動作.webm';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);mode=old.mode;time=old.time;paused=old.paused;speed=old.speed;document.querySelector('#mode').value=mode;document.querySelector('#pause').textContent=paused?'繼續':'暫停';recordButton.disabled=false;recordButton.textContent='錄製動作影片';};
 recorder.start();const start=performance.now();
 function capture(now){const elapsed=(now-start)/1000;
 if(elapsed>=47){recorder.stop();return;}
 mode=elapsed<11?'land':elapsed<21?'water':'season';time=elapsed<11?elapsed:elapsed<21?elapsed-11:elapsed-21;
 if(mode==='land')land(time);else if(mode==='water')underwater(time);else season(time);
 rain.visible=mode==='season'&&time<18;if(rain.visible){for(let i=0;i<240;i++)rainPos[i*3+1]=(8-(time*6+(i*.73)%8)%8);rainGeo.attributes.position.needsUpdate=true;}
 renderer.render(scene,camera);
 ctx.fillStyle='#22232d';ctx.fillRect(0,0,1280,720);
 const source=renderer.domElement,scale=Math.min(1280/source.width,610/source.height),w=source.width*scale,h=source.height*scale;ctx.drawImage(source,(1280-w)/2,46,w,h);
 ctx.fillStyle='#f3eee4';ctx.font='bold 28px "PingFang TC",sans-serif';ctx.fillText(mode==='land'?'陸地：起跳、縮球與滾動':mode==='water'?'水下：蹬跳與換氣':'雨季：淋雨入河與雨停上岸',36,38);
 ctx.font='22px "PingFang TC",sans-serif';ctx.fillText(phase.textContent,36,662);
 ctx.fillStyle='#afb7bd';ctx.font='17px "PingFang TC",sans-serif';ctx.fillText('3D 動作雛形，時間已縮短供觀察。配色與外觀暫定。',36,696);
 ctx.fillStyle='#879d80';ctx.fillRect(0,715,1280*elapsed/47,5);
 requestAnimationFrame(capture);
 }
 requestAnimationFrame(capture);
};
