/* ============================================================
   展厅的示例展品：六件单文件小作品，全部是演示数据。
   真实活动里，展位上放的是作者自己提交的文件（见 28-hall.js 的 hallSubmit）。
   每件都接了隔壁 SDK：握手后把画面推回展位上的屏幕。
   写法限制：字符串里不要出现反引号和美元花括号。
   ============================================================ */
const HW_HEAD = `<!doctype html><html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
html,body{margin:0;height:100%;background:#0b0d11;color:#e1e7f3;font:14px system-ui,"PingFang SC","Microsoft YaHei",sans-serif;overflow:hidden;touch-action:none;-webkit-user-select:none;user-select:none}
#w{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px}
canvas{width:min(96vw,101vh);max-height:76vh;aspect-ratio:4/3;border-radius:10px;background:#111318;cursor:pointer}
#h{opacity:.75;font-size:13px;text-align:center;padding:0 12px}
</style></head><body><div id="w"><canvas id="c" width="320" height="240"></canvas><div id="h">`;
const HW_SDK = `</div></div><script>
var c=document.getElementById('c'),g=c.getContext('2d'),linked=0,pa=0;
addEventListener('message',function(e){var m=e.data;if(!m||m.gebi!==1||m.type!=='hello')return;linked=1;parent.postMessage({gebi:1,type:'ready'},'*');});
function push(dt){pa+=dt;if(pa<.1||!linked||!window.createImageBitmap)return;pa=0;createImageBitmap(c).then(function(f){try{parent.postMessage({gebi:1,type:'screen',frame:f},'*',[f]);}catch(x){}});}
function pos(e){var r=c.getBoundingClientRect();return{x:(e.clientX-r.left)/r.width*320,y:(e.clientY-r.top)/r.height*240};}
function mid(t,y,s){g.fillStyle='#fff';g.font=(s||16)+'px sans-serif';g.textAlign='center';g.fillText(t,160,y);g.textAlign='left';}
function veil(){g.fillStyle='rgba(0,0,0,.62)';g.fillRect(0,0,320,240);}
`;
const HW_TAIL = `
window.focus();<\/script></body></html>`;
const hwDoc = (hint, script) => HW_HEAD + hint + HW_SDK + script + HW_TAIL;

const HALL_WORKS = {
  /* 接星星：左右移动接住落下的星星，漏三颗结束 */
  catch: hwDoc('移动鼠标或按 ← → 接星星，漏掉三颗就结束', `
var px=160,stars=[],score=0,miss=0,t=0,over=0,acc=0,last=performance.now(),keys={};
function reset(){stars=[];score=0;miss=0;over=0;t=0;}
c.addEventListener('pointermove',function(e){px=pos(e).x;});
c.addEventListener('pointerdown',function(e){px=pos(e).x;if(over)reset();});
addEventListener('keydown',function(e){keys[e.key]=1;if(over&&(e.key===' '||e.key==='Enter'))reset();});
addEventListener('keyup',function(e){keys[e.key]=0;});
function loop(n){var dt=Math.min(.05,(n-last)/1000);last=n;
if(!over){t+=dt;acc+=dt;if(keys.ArrowLeft||keys.a)px-=240*dt;if(keys.ArrowRight||keys.d)px+=240*dt;px=Math.max(24,Math.min(296,px));
if(acc>Math.max(.28,.9-t*.012)){acc=0;stars.push({x:16+Math.random()*288,y:-8,v:60+Math.random()*40+t*2.2,h:30+Math.random()*60});}
for(var i=stars.length-1;i>=0;i--){var s=stars[i];s.y+=s.v*dt;if(s.y>212&&s.y<230&&Math.abs(s.x-px)<28){score++;stars.splice(i,1);}else if(s.y>246){miss++;stars.splice(i,1);if(miss>=3)over=1;}}}
g.fillStyle='#0d1020';g.fillRect(0,0,320,240);
for(var j=0;j<stars.length;j++){var q=stars[j];g.fillStyle='hsl('+q.h+',95%,65%)';g.beginPath();for(var k=0;k<10;k++){var a=k*Math.PI/5-Math.PI/2,r=k%2?3:7;g.lineTo(q.x+Math.cos(a)*r,q.y+Math.sin(a)*r);}g.fill();}
g.fillStyle='#62e6d4';g.fillRect(px-24,218,48,7);
g.fillStyle='#e1e7f3';g.font='12px monospace';g.fillText('接住 '+score,8,16);g.fillText('漏掉 '+miss+'/3',250,16);
if(over){veil();mid('接住了 '+score+' 颗',112,18);mid('点一下再来',136,12);}
push(dt);requestAnimationFrame(loop);}
requestAnimationFrame(loop);`),

  /* 一分钟打砖块 */
  bricks: hwDoc('移动鼠标或按 ← → 控制挡板，一分钟内能打掉多少', `
var px=160,b,bricks,score,left,mode='ready',last=performance.now(),keys={};
function reset(){b={x:160,y:180,vx:90,vy:-150};bricks=[];for(var r=0;r<5;r++)for(var i=0;i<8;i++)bricks.push({x:8+i*38,y:28+r*14,h:r*34+170,on:1});score=0;left=60;}
reset();
function start(){if(mode!=='play'){reset();mode='play';}}
c.addEventListener('pointermove',function(e){px=pos(e).x;});c.addEventListener('pointerdown',function(e){px=pos(e).x;start();});
addEventListener('keydown',function(e){keys[e.key]=1;if(e.key===' '||e.key==='Enter')start();});addEventListener('keyup',function(e){keys[e.key]=0;});
function loop(n){var dt=Math.min(.03,(n-last)/1000);last=n;
if(keys.ArrowLeft||keys.a)px-=260*dt;if(keys.ArrowRight||keys.d)px+=260*dt;px=Math.max(26,Math.min(294,px));
if(mode==='play'){left-=dt;b.x+=b.vx*dt;b.y+=b.vy*dt;
if(b.x<4||b.x>316){b.vx=-b.vx;b.x=Math.max(4,Math.min(316,b.x));}if(b.y<4){b.vy=Math.abs(b.vy);}
if(b.y>210&&b.y<220&&b.vy>0&&Math.abs(b.x-px)<30){b.vy=-Math.abs(b.vy)*1.02;b.vx=(b.x-px)*6;}
if(b.y>244){b.x=px;b.y=200;b.vy=-150;b.vx=60;left-=3;}
for(var i=0;i<bricks.length;i++){var k=bricks[i];if(k.on&&b.x>k.x&&b.x<k.x+34&&b.y>k.y&&b.y<k.y+10){k.on=0;b.vy=-b.vy;score++;break;}}
if(!bricks.some(function(k){return k.on;})){for(var j=0;j<bricks.length;j++)bricks[j].on=1;}
if(left<=0){left=0;mode='over';}}
g.fillStyle='#10131f';g.fillRect(0,0,320,240);
for(var m=0;m<bricks.length;m++){var q=bricks[m];if(!q.on)continue;g.fillStyle='hsl('+q.h+',80%,62%)';g.fillRect(q.x,q.y,34,10);}
g.fillStyle='#ffb454';g.fillRect(px-26,214,52,6);g.fillStyle='#fff';g.beginPath();g.arc(b.x,b.y,4,0,7);g.fill();
g.fillStyle='#e1e7f3';g.font='12px monospace';g.fillText('砖块 '+score,8,16);g.fillText(Math.ceil(left)+' 秒',274,16);
if(mode==='ready'){veil();mid('一分钟打砖块',112,18);mid('点一下开始',136,12);}
if(mode==='over'){veil();mid('打掉 '+score+' 块',112,18);mid('点一下再来',136,12);}
push(dt);requestAnimationFrame(loop);}
requestAnimationFrame(loop);`),

  /* 跟我亮灯：记住亮灯顺序再点一遍 */
  lights: hwDoc('记住四盏灯亮起的顺序，再照着点一遍', `
var P=[[60,30,'#ff7aa8'],[170,30,'#62e6d4'],[60,125,'#ffb454'],[170,125,'#7db7ff']],seq=[],at=0,lit=-1,mode='ready',tm=0,best=0,last=performance.now();
function next(){seq.push(Math.floor(Math.random()*4));at=0;mode='show';tm=.6;lit=-1;}
function hit(i){if(mode==='ready'||mode==='over'){seq=[];next();return;}if(mode!=='input')return;lit=i;tm=.18;
if(seq[at]!==i){mode='over';best=Math.max(best,seq.length-1);return;}at++;if(at>=seq.length){mode='wait';tm=.7;}}
c.addEventListener('pointerdown',function(e){var p=pos(e),k=-1;for(var i=0;i<4;i++)if(p.x>P[i][0]&&p.x<P[i][0]+90&&p.y>P[i][1]&&p.y<P[i][1]+85)k=i;if(k<0&&mode==='input')return;hit(k<0?0:k);});
addEventListener('keydown',function(e){var k='1234'.indexOf(e.key);if(k>=0)hit(k);else if(e.key===' '||e.key==='Enter')hit(0);});
function loop(n){var dt=Math.min(.05,(n-last)/1000);last=n;tm-=dt;
if(mode==='show'&&tm<=0){if(lit>=0){lit=-1;tm=.18;}else if(at<seq.length){lit=seq[at++];tm=.42;}else{mode='input';at=0;}}
if(mode==='input'&&tm<=0)lit=-1;
if(mode==='wait'&&tm<=0)next();
g.fillStyle='#0f1118';g.fillRect(0,0,320,240);
for(var i=0;i<4;i++){g.globalAlpha=lit===i?1:.28;g.fillStyle=P[i][2];g.fillRect(P[i][0],P[i][1],90,85);g.globalAlpha=1;g.fillStyle='#0f1118';g.font='12px monospace';g.fillText(String(i+1),P[i][0]+6,P[i][1]+16);}
g.fillStyle='#e1e7f3';g.font='12px monospace';g.fillText('第 '+seq.length+' 轮',270,60);g.fillText('最好 '+best,270,80);
g.fillText(mode==='show'?'看':mode==='input'?'点':'',284,120);
if(mode==='ready'){veil();mid('跟我亮灯',112,18);mid('点一下开始，也可以按 1 2 3 4',136,12);}
if(mode==='over'){veil();mid('记住了 '+(seq.length-1)+' 步',112,18);mid('点一下再来',136,12);}
push(dt);requestAnimationFrame(loop);}
requestAnimationFrame(loop);`),

  /* 反应力：变绿就点，五次取平均 */
  reflex: hwDoc('屏幕变绿的一瞬间点下去，五次取平均', `
var mode='ready',tm=0,t0=0,rs=[],msg='',last=performance.now();
function go(){if(mode==='ready'||mode==='done'){rs=[];arm();}else if(mode==='wait'){msg='太早了，重来这一次';arm();}else if(mode==='go'){rs.push(Math.round(performance.now()-t0));msg=rs[rs.length-1]+' 毫秒';if(rs.length>=5)mode='done';else arm();}}
function arm(){mode='wait';tm=1.2+Math.random()*2.4;}
c.addEventListener('pointerdown',go);addEventListener('keydown',function(e){if(e.key===' '||e.key==='Enter')go();});
function loop(n){var dt=Math.min(.05,(n-last)/1000);last=n;
if(mode==='wait'){tm-=dt;if(tm<=0){mode='go';t0=performance.now();}}
g.fillStyle=mode==='go'?'#1f9d6b':mode==='wait'?'#8a2f3c':'#141722';g.fillRect(0,0,320,240);
if(mode==='ready'){mid('反应力测试',104,18);mid('点一下开始，变绿就点',130,12);}
if(mode==='wait'){mid('等它变绿……',112,18);mid(msg,140,12);}
if(mode==='go')mid('点！',124,30);
if(mode==='done'){var a=Math.round(rs.reduce(function(x,y){return x+y;},0)/rs.length);mid('平均 '+a+' 毫秒',100,20);mid(rs.join(' · '),128,12);mid('点一下再测',154,12);}
g.fillStyle='rgba(255,255,255,.7)';g.font='12px monospace';g.fillText(rs.length+'/5',290,16);
push(dt);requestAnimationFrame(loop);}
requestAnimationFrame(loop);`),

  /* 点一下长棵树：每次点击长出一棵不一样的树 */
  trees: hwDoc('点画面任意位置，长出一棵不一样的树', `
var grow=[],n=0,last=performance.now();
function sky(){var gr=g.createLinearGradient(0,0,0,240);gr.addColorStop(0,'#141a33');gr.addColorStop(1,'#2a2440');g.fillStyle=gr;g.fillRect(0,0,320,240);g.fillStyle='#1b2a26';g.fillRect(0,214,320,26);}
sky();
function plant(x){var h=90+Math.random()*120;grow.push({x:x,y:216,a:-Math.PI/2,l:22+Math.random()*16,w:5,d:0,h:h,p:0});n++;}
c.addEventListener('pointerdown',function(e){plant(pos(e).x);});
addEventListener('keydown',function(e){if(e.key===' '||e.key==='Enter')plant(30+Math.random()*260);if(e.key==='c'){sky();n=0;}});
function loop(now){var dt=Math.min(.05,(now-last)/1000);last=now;
for(var i=grow.length-1;i>=0;i--){var b=grow[i],q=Math.min(1,b.p+dt*3.2),x0=b.x+Math.cos(b.a)*b.l*b.p,y0=b.y+Math.sin(b.a)*b.l*b.p,x1=b.x+Math.cos(b.a)*b.l*q,y1=b.y+Math.sin(b.a)*b.l*q;
g.strokeStyle=b.d<3?'hsl(28,35%,'+(34+b.d*5)+'%)':'hsl('+b.h+',60%,62%)';g.lineWidth=Math.max(1,b.w);g.lineCap='round';g.beginPath();g.moveTo(x0,y0);g.lineTo(x1,y1);g.stroke();b.p=q;
if(q>=1){grow.splice(i,1);if(b.d<6){var k=b.d<2?2:(Math.random()<.75?2:3);for(var j=0;j<k;j++)grow.push({x:x1,y:y1,a:b.a+(Math.random()-.5)*1.25,l:b.l*(.68+Math.random()*.16),w:b.w*.68,d:b.d+1,h:b.h,p:0});}}}
g.fillStyle='rgba(20,26,51,.9)';g.fillRect(0,0,70,22);g.fillStyle='#e1e7f3';g.font='12px monospace';g.fillText(n+' 棵树',8,15);
push(dt);requestAnimationFrame(loop);}
plant(90);plant(220);requestAnimationFrame(loop);`),

  /* 节拍垫：点格子编一段四小节的鼓点 */
  beats: hwDoc('点格子编一段鼓点，按空格播放或暂停', `
var R=['镲','军鼓','底鼓','铃'],F=[0,0,60,880],G=[],step=0,acc=0,play=0,ac=null,last=performance.now();
for(var r=0;r<4;r++){G.push([]);for(var i=0;i<8;i++)G[r].push(0);}
G[2][0]=G[2][4]=G[1][2]=G[1][6]=G[0][1]=G[0][3]=G[0][5]=G[0][7]=1;
function hit(r){if(!ac)return;var t=ac.currentTime,o,gn=ac.createGain();gn.connect(ac.destination);
if(r<2){var len=r?0.12:0.05,buf=ac.createBuffer(1,ac.sampleRate*len,ac.sampleRate),d=buf.getChannelData(0);for(var i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*(1-i/d.length);o=ac.createBufferSource();o.buffer=buf;gn.gain.value=r?0.35:0.18;o.connect(gn);o.start(t);}
else{o=ac.createOscillator();o.frequency.setValueAtTime(r===2?140:F[r],t);if(r===2)o.frequency.exponentialRampToValueAtTime(45,t+.14);gn.gain.setValueAtTime(r===2?0.6:0.18,t);gn.gain.exponentialRampToValueAtTime(.001,t+(r===2?.2:.18));o.connect(gn);o.start(t);o.stop(t+.22);}}
function toggle(){try{if(!ac)ac=new (window.AudioContext||window.webkitAudioContext)();if(ac.state==='suspended')ac.resume();}catch(e){}play=!play;}
c.addEventListener('pointerdown',function(e){var p=pos(e);if(p.y>200){toggle();return;}var i=Math.floor((p.x-48)/33),r=Math.floor((p.y-24)/42);if(i>=0&&i<8&&r>=0&&r<4){G[r][i]=G[r][i]?0:1;if(G[r][i]){if(!ac)toggle(),play=0;hit(r);}}});
addEventListener('keydown',function(e){if(e.key===' '||e.key==='Enter')toggle();});
function loop(n){var dt=Math.min(.05,(n-last)/1000);last=n;
if(play){acc+=dt;if(acc>.2){acc-=.2;step=(step+1)%8;for(var r=0;r<4;r++)if(G[r][step])hit(r);}}
g.fillStyle='#12141d';g.fillRect(0,0,320,240);
for(var r2=0;r2<4;r2++){g.fillStyle='#9ba4b6';g.font='12px sans-serif';g.fillText(R[r2],10,24+r2*42+24);
for(var i=0;i<8;i++){var on=G[r2][i];g.fillStyle=on?['#ffb454','#ff7aa8','#62e6d4','#7db7ff'][r2]:(i%4?'#1d2027':'#252a33');if(play&&i===step)g.globalAlpha=on?1:.6;else g.globalAlpha=on?.85:1;g.fillRect(48+i*33,24+r2*42,29,36);g.globalAlpha=1;}}
if(play){g.strokeStyle='#e1e7f3';g.lineWidth=1.5;g.strokeRect(47+step*33,22,31,166);}
g.fillStyle=play?'#62e6d4':'#2e343e';g.fillRect(110,204,100,26);g.fillStyle=play?'#03201c':'#e1e7f3';g.font='13px sans-serif';g.textAlign='center';g.fillText(play?'暂停':'播放',160,222);g.textAlign='left';
push(dt);requestAnimationFrame(loop);}
requestAnimationFrame(loop);`)
};
