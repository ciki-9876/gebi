/* ============================================================
   In-site work windows: a bound web product runs inside the room
   (sandboxed iframe) and talks back through the gebi SDK.
   ============================================================ */
const SNAKE_DEMO = `<!doctype html><html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>霓虹贪吃蛇</title><style>
html,body{margin:0;height:100%;background:#070a14;color:#e8e4f0;font-family:ui-monospace,Menlo,Consolas,monospace;overflow:hidden}
.wrap{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:16px;box-sizing:border-box}
canvas{image-rendering:pixelated;width:min(92vw,calc((100vh - 120px)*1.25));height:auto;border-radius:10px;box-shadow:0 0 0 1px #1d2440,0 0 60px rgba(98,230,255,.15);touch-action:none}
.hud{display:flex;gap:24px;font-size:13px;color:#8f97b3}.hud b{color:#ffb454;font-weight:400}
.tip{font-size:12px;color:#5d6688;text-align:center}
</style></head><body><div class="wrap"><div class="hud"><span>SCORE <b id="s">0</b></span><span>BEST <b id="b">0</b></span><span id="st">READY</span></div><canvas id="c" width="160" height="128"></canvas><div class="tip">方向键 / WASD / 滑动操作 · 空格重开<br>这是作品自己的网页，在隔壁里以窗口运行</div></div><script>
var GW=20,GH=16,C=8,c=document.getElementById('c'),g=c.getContext('2d');
var snake,dir,next,food,score=0,best=0,mode='ready',acc=0,step=.12,t=0,last=performance.now(),linked=false,pushAcc=0;
function reset(){snake=[{x:7,y:8},{x:6,y:8},{x:5,y:8},{x:4,y:8}];dir={x:1,y:0};next=dir;score=0;step=.12;place();hud();}
function place(){var p;do{p={x:Math.floor(Math.random()*GW),y:Math.floor(Math.random()*GH)}}while(snake.some(function(s){return s.x===p.x&&s.y===p.y}));food=p;}
function safe(x,y){if(x<0||y<0||x>=GW||y>=GH)return false;for(var i=0;i<snake.length-1;i++)if(snake[i].x===x&&snake[i].y===y)return false;return true;}
function tick(){if(mode!=='play')return;dir=next;var h=snake[0],nx=h.x+dir.x,ny=h.y+dir.y;if(!safe(nx,ny)){mode='over';if(score>best){best=score;send({type:'state',data:{best:best}});}hud();return;}snake.unshift({x:nx,y:ny});if(nx===food.x&&ny===food.y){score++;step=Math.max(.065,step-.003);place();hud();}else snake.pop();}
function draw(){g.fillStyle='#0a0e1c';g.fillRect(0,0,160,128);g.fillStyle='#16203a';for(var x=0;x<GW;x++)for(var y=0;y<GH;y++)g.fillRect(x*C+3,y*C+3,2,2);g.fillStyle=Math.sin(t*8)>0?'#ff5aa8':'#ff86c0';g.fillRect(food.x*C+1,food.y*C+1,C-2,C-2);snake.forEach(function(s,i){g.fillStyle=i===0?'#ffb454':(i%2?'#62e6ff':'#3fc6e6');g.fillRect(s.x*C,s.y*C,C-1,C-1);});g.font='8px monospace';g.textBaseline='top';g.fillStyle='#e8e4f0';g.fillText(('00'+score).slice(-3),3,2);if(mode!=='play'){g.fillStyle='rgba(10,14,28,.78)';g.fillRect(0,44,160,42);g.textAlign='center';g.fillStyle='#ffb454';g.font='10px monospace';g.fillText(mode==='over'?'GAME OVER':'NEON SNAKE',80,52);g.fillStyle='#e8e4f0';g.font='8px monospace';g.fillText('PRESS AN ARROW KEY',80,70);g.textAlign='left';}}
function input(d){if(mode!=='play'){reset();mode='play';next=d.x===-1?{x:1,y:0}:d;hud();return;}if(d.x===-dir.x&&d.y===-dir.y)return;next=d;}
function hud(){document.getElementById('s').textContent=score;document.getElementById('b').textContent=best;document.getElementById('st').textContent=mode==='play'?'PLAYING':mode==='over'?'GAME OVER':'READY';}
function send(m){m.gebi=1;try{parent.postMessage(m,'*');}catch(e){}}
function push(){if(!linked||!window.createImageBitmap)return;createImageBitmap(c).then(function(f){try{parent.postMessage({gebi:1,type:'screen',frame:f},'*',[f]);}catch(e){}}).catch(function(){});}
function loop(now){var dt=Math.min(.05,(now-last)/1000);last=now;t+=dt;acc+=dt;while(acc>step){acc-=step;tick();}draw();pushAcc+=dt;if(pushAcc>.08){pushAcc=0;push();}requestAnimationFrame(loop);}
var K={ArrowUp:{x:0,y:-1},KeyW:{x:0,y:-1},ArrowDown:{x:0,y:1},KeyS:{x:0,y:1},ArrowLeft:{x:-1,y:0},KeyA:{x:-1,y:0},ArrowRight:{x:1,y:0},KeyD:{x:1,y:0}};
addEventListener('keydown',function(e){if(K[e.code]){e.preventDefault();input(K[e.code]);}else if(e.code==='Space'){e.preventDefault();reset();mode='ready';hud();}});
var sx=0,sy=0;addEventListener('pointerdown',function(e){sx=e.clientX;sy=e.clientY;window.focus();});
addEventListener('pointerup',function(e){var dx=e.clientX-sx,dy=e.clientY-sy;if(Math.max(Math.abs(dx),Math.abs(dy))<18){if(mode!=='play')input({x:1,y:0});return;}input(Math.abs(dx)>Math.abs(dy)?{x:Math.sign(dx),y:0}:{x:0,y:Math.sign(dy)});});
addEventListener('message',function(e){var d=e.data;if(!d||d.gebi!==1)return;if(d.type==='hello'){linked=true;if(d.data&&+d.data.best>best)best=Math.floor(+d.data.best);hud();send({type:'ready',name:'霓虹贪吃蛇',version:'1.0.0'});}});
reset();requestAnimationFrame(loop);window.focus();
<\/script></body></html>`;

const SHIGUANG_DEMO = `<!doctype html><html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>拾光</title><style>
html,body{margin:0;min-height:100%}
body{font-family:-apple-system,"PingFang SC","Noto Sans SC","Microsoft YaHei",system-ui,sans-serif;transition:background .3s,color .3s}
.app{max-width:520px;margin:0 auto;padding:22px 18px 28px;box-sizing:border-box}
header{display:flex;justify-content:space-between;align-items:baseline;gap:12px}
h1{margin:0;font-size:28px}
.date{font-size:12px;opacity:.65}
.skins{display:flex;gap:6px;margin:16px 0 14px}
.skins button{border:1px solid currentColor;background:transparent;color:inherit;border-radius:999px;padding:4px 13px;font:inherit;font-size:12.5px;opacity:.55;cursor:pointer}
.skins button.on{opacity:1;background:var(--acc);border-color:var(--acc);color:var(--on)}
.label{font-size:12px;opacity:.6;margin:0 0 8px}
ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:7px}
li{display:flex;align-items:center;gap:10px;padding:10px 12px;font-size:14px}
li button{width:20px;height:20px;flex:none;border-radius:50%;border:1.5px solid currentColor;background:transparent;color:inherit;padding:0;cursor:pointer;display:grid;place-items:center}
li button svg{width:12px;height:12px;opacity:0}
li.done span{text-decoration:line-through;opacity:.5}
li.done button{background:var(--acc);border-color:var(--acc);color:var(--on)}
li.done button svg{opacity:1}
input{width:100%;box-sizing:border-box;height:40px;border-radius:10px;border:1px dashed currentColor;background:transparent;color:inherit;padding:0 12px;font:inherit;outline:none;margin-top:12px;opacity:.85}
input::placeholder{color:inherit;opacity:.55}
.foot{margin-top:20px;font-size:11.5px;opacity:.5;line-height:1.6}
body.light{background:#f6f4ee;color:#2a2a2e;--acc:#4b7bec;--on:#fff}body.light li{border-bottom:1px solid #e3ddd1}
body.capsule{background:#ffe3ec;color:#5a2440;--acc:#ff6fa0;--on:#fff}body.capsule li{background:#fff;border-radius:999px;box-shadow:0 2px 0 #ffb7cf}body.capsule li:nth-child(3n+2){background:#fff4c9;box-shadow:0 2px 0 #f2d77a}body.capsule li:nth-child(3n){background:#dff6ff;box-shadow:0 2px 0 #9fd8ef}
body.key{background:#24262c;color:#efe7d6;--acc:#ffb454;--on:#24262c;font-family:ui-monospace,Menlo,Consolas,monospace}body.key li{background:#33363e;border-radius:7px;box-shadow:0 3px 0 #17181c}body.key li button{border-radius:4px}
</style></head><body class="light"><div class="app"><header><h1>拾光</h1><span class="date" id="date"></span></header>
<div class="skins" id="skins"><button type="button" data-s="light">轻</button><button type="button" data-s="capsule">扭蛋</button><button type="button" data-s="key">键</button></div>
<p class="label">今天</p><ul id="list"></ul><form id="add"><input id="inp" maxlength="40" placeholder="添加待办，回车保存" autocomplete="off"></form>
<div class="foot">拾光网页版 · 示例页面<br>通过隔壁 SDK 与墙上的电子便签同步</div></div><script>
var state={skin:'light',tasks:[]},date='';
var CK='<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6.2 5 8.5l4.5-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
function esc(s){return String(s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
function render(){document.body.className=state.skin;var d=state.tasks.filter(function(t){return t.done;}).length;document.getElementById('date').textContent=(date?date+' · ':'')+d+'/'+state.tasks.length;Array.prototype.forEach.call(document.querySelectorAll('#skins button'),function(b){b.classList.toggle('on',b.getAttribute('data-s')===state.skin);});document.getElementById('list').innerHTML=state.tasks.map(function(t,i){return '<li class="'+(t.done?'done':'')+'"><button type="button" data-i="'+i+'" role="checkbox" aria-checked="'+t.done+'" aria-label="完成">'+CK+'</button><span>'+esc(t.t)+'</span></li>';}).join('');}
function sync(){try{parent.postMessage({gebi:1,type:'state',data:{skin:state.skin,tasks:state.tasks}},'*');}catch(e){}}
document.getElementById('list').addEventListener('click',function(e){var b=e.target.closest('button');if(!b)return;var t=state.tasks[+b.getAttribute('data-i')];t.done=!t.done;render();sync();});
document.getElementById('skins').addEventListener('click',function(e){var b=e.target.closest('button');if(!b)return;state.skin=b.getAttribute('data-s');render();sync();});
document.getElementById('add').addEventListener('submit',function(e){e.preventDefault();var i=document.getElementById('inp'),v=i.value.trim();if(!v)return;state.tasks.unshift({t:v,done:false});if(state.tasks.length>8)state.tasks.pop();i.value='';render();sync();});
addEventListener('message',function(e){var d=e.data;if(!d||d.gebi!==1)return;if(d.type==='hello'){if(d.data){if(Array.isArray(d.data.tasks))state.tasks=d.data.tasks;if(d.data.skin)state.skin=d.data.skin;date=d.data.date||'';}render();parent.postMessage({gebi:1,type:'ready',name:'拾光',version:'1.4.0'},'*');}});
render();
<\/script></body></html>`;

const DEMOS = { shiguang: SHIGUANG_DEMO, game: SNAKE_DEMO };
const FRAME_DENY = ['github.com', 'google.com', 'notion.so', 'notion.site', 'x.com', 'twitter.com', 'facebook.com', 'instagram.com', 'linkedin.com', 'claude.ai', 'chatgpt.com', 'apple.com', 'microsoft.com', 'chromewebstore.google.com', 'figma.com', 'bilibili.com', 'zhihu.com', 'weibo.com', 'taobao.com'];
function frameDenyHint(url) {
  if (!validUrl(url)) return '';
  let host = ''; try { host = new URL(url.trim()).host.replace(/^www\./, ''); } catch (e) { return ''; }
  return FRAME_DENY.some(d => host === d || host.endsWith('.' + d)) ? `${host} 通常禁止被其他网站嵌入，建议选“新标签页”。` : '';
}
const PLATFORMS = [
  { k: 'win', label: 'Windows 桌面版', verb: '下载安装包', ph: 'https://github.com/你的账号/shiguang/releases/latest/download/Shiguang-Setup.exe', icon: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 4.5 9 3.6v5.9H3zM10 3.5 17 2.5v7H10zM3 10.5h6v5.9l-6-.9zM10 10.5h7v7l-7-1z" fill="#62e6ff"/></svg>' },
  { k: 'mac', label: 'macOS 版', verb: '下载', ph: 'https://github.com/你的账号/shiguang/releases/latest/download/Shiguang.dmg', icon: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M13.6 10.6c0-2 1.6-2.9 1.7-3-1-1.4-2.4-1.6-2.9-1.6-1.2-.1-2.4.7-3 .7s-1.6-.7-2.6-.7C5.4 6 4 7.1 4 9.7c0 1.6.6 3.2 1.4 4.3.7 1 1.3 1.8 2.2 1.8.9 0 1.2-.6 2.3-.6s1.4.6 2.3.6c1 0 1.6-.9 2.2-1.8.7-1 .9-1.9 1-2-.1 0-1.8-.7-1.8-2.4zM11.8 4.7c.5-.6.8-1.4.7-2.2-.7 0-1.6.5-2.1 1.1-.5.5-.9 1.4-.8 2.2.8.1 1.7-.4 2.2-1.1z" fill="#e9e2d0"/></svg>' },
  { k: 'chrome', label: 'Chrome 扩展', verb: '添加到 Chrome', ph: 'https://chromewebstore.google.com/detail/你的扩展', icon: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7.5" fill="#ffb454"/><circle cx="10" cy="10" r="3.2" fill="#3d5afe" stroke="#fff" stroke-width="1.4"/></svg>' },
  { k: 'edge', label: 'Edge 扩展', verb: '添加到 Edge', ph: 'https://microsoftedge.microsoft.com/addons/detail/你的扩展', icon: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M17 11.5c0 3.2-2.9 5.5-6.4 5.5C6.4 17 3 14 3 10a7 7 0 0 1 13.8-1.6c.4 1.4-.4 2.4-2 2.4H9.2c0 1.8 1.6 2.9 3.5 2.9 1.6 0 3-.6 4.3-1.6z" fill="#3ec6e0"/></svg>' }
];
function detectDevice() {
  const ua = navigator.userAgent || '', plat = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '';
  const edge = /Edg\//.test(ua), chrome = /Chrome\//.test(ua) && !edge && !/OPR\//.test(ua);
  const mobile = /Android|iPhone|iPad|Mobile/i.test(ua);
  return { edge, chrome, mobile, win: /Win/i.test(plat) || /Windows/.test(ua), mac: /Mac/i.test(plat) && !/iPhone|iPad/.test(ua) };
}
function recommend(keys) {
  const d = detectDevice(); if (d.mobile) return null;
  if (d.win && keys.includes('win')) return { k: 'win', why: '你在用 Windows' };
  if (d.mac && keys.includes('mac')) return { k: 'mac', why: '你在用 Mac' };
  if (d.edge && keys.includes('edge')) return { k: 'edge', why: '你在用 Edge 浏览器' };
  if (d.chrome && keys.includes('chrome')) return { k: 'chrome', why: '你在用 Chrome 浏览器' };
  return null;
}
function hasDownloads(e) { return !!(e && e.downloads && PLATFORMS.some(p => e.downloads[p.k] && validUrl(e.downloads[p.k].url))); }
function downloadsHTML(e, opts = {}) {
  const dl = (e && e.downloads) || {}, owner = !!(S.room && S.room.mine);
  const filled = PLATFORMS.filter(p => dl[p.k] && validUrl(dl[p.k].url));
  if (!filled.length && !owner) return '';
  const rec = recommend(filled.map(p => p.k));
  const host = u => { try { return new URL(u).host; } catch (x) { return ''; } };
  let html = opts.noTitle ? '' : '<p class="section-t">获取客户端</p>';
  if (rec) {
    const p = PLATFORMS.find(x => x.k === rec.k), it = dl[p.k];
    html += `<div class="dl-primary"><span class="dl-ico">${p.icon}</span><div class="grow"><b>${p.label}${it.ver ? ' · ' + esc(it.ver) : ''}</b><span>${esc(rec.why)}，推荐这个</span></div><a class="btn primary sm" href="${esc(it.url)}" target="_blank" rel="noopener noreferrer">${p.verb} ${ICON.ext}</a></div>`;
  }
  const rows = PLATFORMS.filter(p => !(rec && rec.k === p.k)).filter(p => owner || (dl[p.k] && validUrl(dl[p.k].url))).map(p => {
    const it = dl[p.k];
    if (it && validUrl(it.url)) return `<li><span class="dl-ico">${p.icon}</span><div class="grow">${p.label}${it.ver ? ' · ' + esc(it.ver) : ''}<small>来自 ${esc(host(it.url))}</small></div><a class="btn sm" href="${esc(it.url)}" target="_blank" rel="noopener noreferrer">${p.verb}</a></li>`;
    return `<li><span class="dl-ico">${p.icon}</span><div class="grow">${p.label}<small>还没填写下载地址</small></div>${owner ? '<button type="button" class="btn sm ghost" data-act="bind">去填写</button>' : ''}</li>`;
  }).join('');
  if (rows) html += `<ul class="dl-list">${rows}</ul>`;
  html += `<p class="mute small u-mt3">${filled.length ? '下载地址由房主填写，指向房主自己的发布渠道；隔壁不托管安装包。' : '在建造模式里选中这个物件，填上各平台的下载地址后，访客会看到适合自己设备的那一项。'}</p>`;
  return html;
}

const WINS = new Map();
S.win = null; S.embedBlocked = false;
const winsEl = $('#wins'), taskbar = $('#taskbar'), winBackdrop = $('#winBackdrop');
const WICON = {
  reload: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13 8a5 5 0 1 1-1.5-3.6M13 2v3h-3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  min: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 11.5h9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  x: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8m0-8-8 8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>'
};
function embedSource(e) {
  if (!e) return null;
  if (e.work && (e.work.startsWith('local:') || WORK_RE.test(e.work))) return { hosted: e.work, external: false };
  if (validUrl(e.url)) return { src: e.url.trim(), external: true };
  if (DEMOS[e.kind]) return { srcdoc: DEMOS[e.kind], external: false };
  return null;
}
function canEmbed(e) { const s = embedSource(e); if (!s || (e.open === 'tab' && s.external)) return false; if (!s.external && !s.hosted && S.embedBlocked) return false; return true; }
function screenOf(g) { return g && g.userData && g.userData.screen; }
function openWindow(g) {
  const e = entryOf(g), iid = g.userData.iid;
  closePanel(true); bubble.hidden = true; tip.hidden = true;
  if (S.win && S.win.iid !== iid) minimizeWin(S.win, true);
  let w = WINS.get(iid);
  if (!w) {
    if (WINS.size >= 4) { const old = [...WINS.values()].find(x => x !== S.win); if (old) closeWin(old, true); }
    w = createWin(g, e); WINS.set(iid, w);
  }
  showWin(w);
}
function createWin(g, e) {
  if (e.art) return createArtWin(g, e);
  const src = embedSource(e), iid = g.userData.iid;
  const size = e.size || (e.kind === 'game' || e.kind === 'game2' ? 'wide' : 'tall');
  const kc = KIND_COLOR[e.kind] || KIND_COLOR.link;
  let host = '内置示例', origin = '*';
  if (src.external) { try { const u = new URL(src.src); host = u.host; origin = u.origin; } catch (x) {} }
  if (src.hosted) host = '隔壁托管' + (e.workBytes ? ' · ' + kb(e.workBytes) : '');
  if (e.from) host += ` · ${e.from.adapted ? '改编自' : '收藏自'} ${e.from.by || '邻居'}`;
  const el = document.createElement('section');
  el.className = 'win ' + size; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', e.title || '作品');
  el.innerHTML = `<header class="win-bar"><i class="win-dot" style="background:linear-gradient(135deg,${kc[0]},${kc[1]})"></i>
    <div class="win-t"><b>${esc(e.title || '作品')}</b><span class="win-sub"><span class="win-host">${esc(host)}</span><button type="button" class="win-sdk" data-a="sdk" disabled>连接中</button></span></div>
    <div class="win-act">${curateOK(e) ? '<button type="button" class="win-get" data-a="collect">☆ 收藏</button><button type="button" class="win-get" data-a="adapt">改编</button>' : ''}${(hasDownloads(e) || (e.kind === 'shiguang' && S.room && S.room.mine)) ? '<button type="button" class="win-get" data-a="dl" aria-expanded="false">获取客户端</button>' : ''}
    <button type="button" class="wbtn" data-a="reload" aria-label="重新载入">${WICON.reload}</button>
    ${src.external ? `<a class="wbtn" href="${esc(src.src)}" target="_blank" rel="noopener noreferrer" aria-label="在新标签页打开">${ICON.ext}</a>` : ''}
    <button type="button" class="wbtn" data-a="min" aria-label="收起到任务栏">${WICON.min}</button>
    <button type="button" class="wbtn x" data-a="close" aria-label="关闭">${WICON.x}</button></div></header>
    <div class="win-body"><div class="win-load"><div class="bar-anim"><i></i></div><span>正在从「${esc(nameOf(g))}」里打开 ${esc(e.title || '作品')}…</span></div><div class="win-hint" hidden></div><div class="win-dl" hidden></div></div>`;
  const iframe = document.createElement('iframe');
  iframe.title = e.title || '作品';
  iframe.setAttribute('sandbox', src.external ? 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals allow-pointer-lock' : src.hosted ? 'allow-scripts allow-forms allow-modals allow-pointer-lock allow-popups' : 'allow-scripts allow-pointer-lock');
  iframe.setAttribute('allow', 'fullscreen; gamepad; clipboard-write; autoplay');
  iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
  const body = el.querySelector('.win-body'); body.prepend(iframe);
  const w = { iid, g, e, el, iframe, size, src, origin, kind: e.kind, sdk: false, loaded: false, timers: [] };
  iframe.addEventListener('load', () => {
    w.loaded = true;
    body.querySelector('.win-load').hidden = true;
    hello(w);
    clearTimeout(w.hs); w.hs = setTimeout(() => { if (!w.sdk) noHandshake(w); }, 4000);
  });
  w.timers.push(setTimeout(() => { if (!w.loaded && !w.sdk) noHandshake(w); }, 9000));
  el.addEventListener('click', ev => {
    const b = ev.target.closest('[data-a]'); if (!b) return;
    const a = b.dataset.a;
    if (a === 'min') minimizeWin(w);
    else if (a === 'close') closeWin(w);
    else if (a === 'reload') { w.sdk = false; setSdk(w, '连接中', ''); body.querySelector('.win-hint').hidden = true; body.querySelector('.win-load').hidden = false; if (src.hosted) iframe.srcdoc = w.html || ''; else if (src.srcdoc) iframe.srcdoc = src.srcdoc; else iframe.src = src.src; }
    else if (a === 'dl') toggleDl(w, b);
    else if (a === 'sdk') openSdkGuide();
    else if (a === 'collect') collectEntry(e);
    else if (a === 'adapt') adaptEntry(e);
    else if (a === 'tab') { /* plain link */ }
    else if (a === 'always-tab') { e.open = 'tab'; saveLayout(); closeWin(w); toast('以后点这个物件会在新标签页打开'); }
  });
  if (src.hosted) loadWork(src.hosted).then(html => {
    if (!WINS.has(iid)) return;
    if (!html) { body.querySelector('.win-load').innerHTML = '<span>作品文件没找到。房主可能刚刚移除了它。</span>'; return; }
    w.html = html; iframe.srcdoc = html;
  });
  else if (src.srcdoc) iframe.srcdoc = src.srcdoc; else iframe.src = src.src;
  winsEl.appendChild(el);
  return w;
}
function hello(w) {
  const data = w.kind === 'shiguang' ? { tasks: SG.tasks, skin: SG.skin, date: DATE_STR } : w.kind === 'game' ? { best: game.best } : {};
  try { w.iframe.contentWindow.postMessage({ gebi: 1, type: 'hello', room: { no: S.room.no, name: S.room.name, owner: S.room.owner }, entry: { title: w.e.title }, data }, w.origin); } catch (x) {}
}
function setSdk(w, text, cls) { const s = w.el.querySelector('.win-sdk'); s.textContent = text; s.className = 'win-sdk ' + (cls || ''); s.disabled = !/off|err/.test(cls || ''); s.title = s.disabled ? '' : '查看隔壁 SDK 接入说明'; }
function noHandshake(w) {
  if (!WINS.has(w.iid) || w.sdk) return;
  if (w.src.hosted) {
    if (!w.loaded) return;
    w.el.querySelector('.win-load').hidden = true;
    setSdk(w, '未接入 SDK · 怎么接', 'off');
    return;
  }
  if (!w.src.external) {
    // the built-in demo could not run as an embedded page here: fall back to the built-in panel
    S.embedBlocked = true;
    const g = w.g; closeWin(w, true);
    toast('当前环境拦截了嵌入页面，已改用房间内置的版本', 3600);
    if (w.kind === 'shiguang') openShiguang(g); else if (w.kind === 'game') openGame(g);
    return;
  }
  w.el.querySelector('.win-load').hidden = true;
  // 跨域页面里看不到内容：没握手时，“加载成功但没接 SDK”和“被拦截/加载失败”分不清，所以照实说
  setSdk(w, w.loaded ? '未接入 SDK · 怎么接' : '加载失败', w.loaded ? 'off' : 'err');
  const hint = w.el.querySelector('.win-hint');
  hint.innerHTML = `${w.loaded
    ? '<b>窗口里如果有画面，作品就能正常用</b>：它只是没有接入隔壁 SDK，房间里的物件不会同步。<br><b>如果是一片空白</b>：这个网站多半禁止被嵌入，或者加载失败了。隔壁看不到跨站页面的内容，没法替你判断是哪一种。'
    : '<b>9 秒内没有加载出来。</b>可能是网址打不开、网络太慢，或者网站禁止被其他网站嵌入。'}
    <div class="row"><a class="btn sm primary" href="${esc(w.src.src)}" target="_blank" rel="noopener noreferrer">在新标签页打开 ${ICON.ext}</a>${S.room && S.room.mine ? '<button type="button" class="btn sm" data-a="always-tab">以后都用新标签页</button>' : ''}${w.loaded && S.room && S.room.mine ? '<button type="button" class="btn sm ghost" data-a="sdk">接入 SDK</button>' : ''}<button type="button" class="btn sm ghost" data-hide="1">知道了</button></div>`;
  hint.hidden = false;
  hint.querySelector('[data-hide]').addEventListener('click', () => { hint.hidden = true; });
  if (S.room) logOpen(roomKey(S.room), w.loaded ? 'nosdk' : 'fail');
}
function toggleDl(w, btn) {
  const d = w.el.querySelector('.win-dl'), open = d.hidden;
  if (open) {
    d.innerHTML = downloadsHTML(w.e);
    d.querySelectorAll('[data-act="bind"]').forEach(b => b.addEventListener('click', () => { const iid = w.iid; closeAllWins(); setMode('build'); setTimeout(() => selectItem(findGroup(iid)), 60); }));
  }
  d.hidden = !open; btn.setAttribute('aria-expanded', open);
}
function showWin(w) {
  w.el.hidden = false; S.win = w; S.focus = w.g;
  winBackdrop.hidden = !(w.size === 'wide' && !isNarrow());
  focusOn(w.g, { panel: w.size === 'tall', loose: true });
  renderTaskbar();
  setTimeout(() => { try { w.iframe.focus(); } catch (x) {} }, 450);
}
function minimizeWin(w, quiet) {
  if (!w) return;
  w.el.hidden = true;
  if (S.win === w) { S.win = null; S.focus = null; winBackdrop.hidden = true; if (!quiet) setView('room'); }
  renderTaskbar();
  if (!quiet && !S.minHinted) { S.minHinted = true; toast('已收起到任务栏，作品保持当前状态，点任务栏回来'); }
}
function closeWin(w, quiet) {
  if (!w || !WINS.has(w.iid)) return;
  w.timers.forEach(clearTimeout); clearTimeout(w.hs); if (w.onClose) w.onClose();
  w.el.remove(); WINS.delete(w.iid);
  if (game.remote === w) { game.remote = null; game.mode = 'attract'; gReset(); }
  const sc = screenOf(w.g); if (sc && sc.restore) sc.restore();
  if (S.win === w) { S.win = null; S.focus = null; winBackdrop.hidden = true; if (!quiet) setView(S.mode === 'build' ? 'build' : 'room'); }
  renderTaskbar();
}
function closeAllWins() { [...WINS.values()].forEach(w => closeWin(w, true)); winBackdrop.hidden = true; }
function renderTaskbar() {
  const list = [...WINS.values()];
  taskbar.hidden = !list.length || S.view !== 'room';
  taskbar.innerHTML = list.map(w => `<button type="button" class="task ${S.win === w ? 'on' : ''}" data-iid="${esc(w.iid)}"><i></i>${esc(w.e.title || '作品')}</button>`).join('');
  syncDock();
}
taskbar.addEventListener('click', e => {
  const b = e.target.closest('.task'); if (!b) return;
  const w = WINS.get(b.dataset.iid); if (!w) return;
  if (S.win === w) minimizeWin(w); else { if (S.win) minimizeWin(S.win, true); closePanel(true); showWin(w); }
});
winBackdrop.addEventListener('click', () => { if (S.win) minimizeWin(S.win); });
function drawRemoteFrame(w, f) {
  const sc = screenOf(w.g);
  const done = () => { if (f && typeof f.close === 'function') f.close(); };
  if (!sc) return done();
  const ctx = sc.canvas.getContext('2d');
  const paint = img => {
    const cw = sc.canvas.width, ch = sc.canvas.height, iw = img.width, ih = img.height;
    const s = Math.max(cw / iw, ch / ih), dw = iw * s, dh = ih * s;
    ctx.imageSmoothingEnabled = !sc.pixel;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, cw, ch);
    ctx.drawImage(img, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
    sc.tex.needsUpdate = true;
  };
  if (typeof ImageBitmap !== 'undefined' && f instanceof ImageBitmap) { paint(f); done(); }
  else if (typeof f === 'string' && /^data:image\/(png|jpeg|webp);base64,/.test(f) && f.length < 400000) { const im = new Image(); im.onload = () => paint(im); im.src = f; }
}
function applySG(data) {
  if (!data || typeof data !== 'object') return;
  if (Array.isArray(data.tasks)) {
    const tasks = data.tasks.slice(0, 8).filter(t => t && typeof t.t === 'string').map(t => ({ t: t.t.slice(0, 40), done: !!t.done }));
    SG.tasks = tasks;
  }
  if (typeof data.skin === 'string' && SKINS[data.skin]) SG.skin = data.skin;
  saveSG(); drawNote();
}
addEventListener('message', ev => {
  const d = ev.data; if (!d || d.gebi !== 1 || typeof d.type !== 'string') return;
  let w = null; for (const x of WINS.values()) if (x.iframe.contentWindow === ev.source) { w = x; break; }
  if (!w) return;
  if (w.src.external && ev.origin !== w.origin) return;
  switch (d.type) {
    case 'ready':
      w.sdk = true; clearTimeout(w.hs);
      w.el.querySelector('.win-load').hidden = true; w.el.querySelector('.win-hint').hidden = true;
      setSdk(w, '已接入隔壁 SDK · 物件同步中', 'on');
      if (S.room) logOpen(roomKey(S.room), 'sdk');
      if (w.kind === 'game') game.remote = w;
      break;
    case 'screen': if (w.sdk) drawRemoteFrame(w, d.frame); break;
    case 'state':
      if (w.kind === 'shiguang') applySG(d.data);
      if (w.kind === 'game' && d.data && Number.isFinite(+d.data.best) && +d.data.best > game.best) { game.best = Math.floor(+d.data.best); store.set('gebi.best', game.best); }
      break;
    case 'toast': if (typeof d.text === 'string') toast(d.text.slice(0, 60)); break;
    case 'close': closeWin(w); break;
  }
});


/* ---------- build inspector ---------- */
function selectItem(g) {
  if (!g) return;
  S.selected = g; if (S.panel && S.panel.kind !== 'inspect') closePanel(true);
  S.panel = { kind: 'inspect', g };
  const def = g.userData.def, isChild = g.userData.isChild, meta = g.userData.meta || {}, wall = def.wall;
  const movable = !wall && !isChild;
  if (movable) {
    const w = (meta.w || 1), d = (meta.d || 1), odd = (def.rot || 0) % 2;
    S.selRing.visible = true; S.selRing.scale.setScalar(Math.max(odd ? d : w, odd ? w : d) * .62 + .2);
    S.selRing.position.set(def.x, .02, def.z);
  } else S.selRing.visible = false;
  renderInspector(g);
}
function renderInspector(g) {
  const def = g.userData.def, isChild = g.userData.isChild, meta = g.userData.meta || {}, wall = def.wall;
  const movable = !wall && !isChild;
  const e = def.entry;
  const builtin = e && !BIND_KINDS.includes(e.kind);
  const urlAllowed = !e || !['agent', 'guestbook', 'door', 'music'].includes(e.kind);
  const where = wall ? '墙面物件，挂点固定' : isChild ? `挂在「${(ITEMS[g.userData.parentDef.type] || {}).name || ''}」上，随它一起移动` : `位置 ${def.x.toFixed(2)}, ${def.z.toFixed(2)} · 朝向 ${((def.rot || 0) % 4 + 4) % 4 * 90}°`;
  const kindSel = e ? (e.kind) : '';
  const kept = !!(e && e.from && !e.from.adapted);
  const SW = ['', '#ff5a6e', '#ff9a3d', '#e8c030', '#34b88a', '#3d9be8', '#7c4dff', '#d43d86'];
  setPanel('建造 · 物件设置', nameOf(g), `
    <p class="mute small u-mb4">${esc(where)}</p>
    ${movable ? `<div class="u-row u-mb4"><button type="button" class="btn" id="inRot">${ICON.rot}旋转 90°</button>${meta.nodelete ? '' : `<button type="button" class="btn danger" id="inDel">${ICON.del}删除</button>`}</div>` : ''}
    <div class="divider u-mt0"></div>
    <p class="section-t">绑定作品</p>
    ${carrierCats(def.type).length && !isChild ? `<p class="mute small u-mb3">这件物件适合${esc(carrierCats(def.type).map(c => ART_CATS[c].label).join("、"))}的作品。</p><button type="button" class="btn u-mb4" id="inPub">发布 AI 作品到这件物件</button>` : ''}
    ${!e ? `<p class="mute small u-mb3">这件物件现在只是装饰。任何物件都可以变成作品入口。</p><button type="button" class="btn" id="inMake">把它变成作品入口</button>` : kept ? `<p class="small u-mb3"><span class="tag">收藏品</span> 收藏自 <b>${esc(e.from.by || '一位邻居')}</b> 的「${esc(e.from.title)}」</p><p class="mute small u-m0">作品属于原作者，这里只负责展示它：访客点开会链回 TA 的房间。想改成自己的版本，请去原房间点“改编一份”。不想留了，直接删除这件物件就行。</p>` : `
    <form id="inForm">
      ${e.from ? `<p class="small u-mb3"><span class="tag pink">改编</span> 改编自 <b>${esc(e.from.by || '一位邻居')}</b> 的「${esc(e.from.title)}」，署名会一直保留。</p>` : ''}
      ${builtin ? `<p class="small u-mb3"><span class="tag ${e.kind === 'agent' ? 'cyan' : ''}">${esc(KIND_LABEL[e.kind])}</span> <span class="mute">${e.art ? esc(artInfo(e)) + '。要换文件，删掉它重新发布' : '内置入口，打开方式由房间提供'}</span></p>` :
      `<div class="field"><label>作品类型</label><div class="seg" id="inKind">${BIND_KINDS.map(k => `<button type="button" data-k="${k}" aria-pressed="${k === kindSel}">${KIND_LABEL[k]}</button>`).join('')}</div></div>`}
      <div class="field"><label for="inTitle">作品名称</label><input class="input" id="inTitle" maxlength="20" value="${esc(e.title || '')}"></div>
      ${builtin ? '' : `<div class="field"><label>外观 · 主题色</label><div class="swatches" id="inColor">${SW.map(c => `<button type="button" data-c="${c}" style="${c ? 'background:' + c : ''}" aria-pressed="${(e.color || '') === c}" aria-label="${c || '默认'}">${c ? '' : '默认'}</button>`).join('')}</div><span class="mute small">展示屏和街机会换成这个颜色，改编的作品可以先从换色开始。</span></div>`}
      ${urlAllowed ? `<div class="field"><label for="inUrl">作品地址</label><input class="input" id="inUrl" inputmode="url" placeholder="${DEMOS[e.kind] ? '留空则使用内置示例' : 'https://'}" value="${esc(e.url || '')}"><span class="err" id="inErr" hidden></span><span class="note-warn" id="inWarn">${esc(frameDenyHint(e.url))}</span><span class="hint-s">想让房间里的物件跟着作品变化？<button type="button" class="linkbtn" id="inSdk">看 SDK 接入说明</button></span></div>
      <div class="field"><label>或者上传作品文件，由隔壁托管</label>
        <div class="host-row"><label class="btn sm" for="inFile">选择 .html 文件</label><input type="file" id="inFile" accept=".html,.htm,text/html" hidden><button type="button" class="btn sm ghost" id="inPasteBtn">粘贴代码</button>${e.work ? '<button type="button" class="btn sm ghost danger" id="inUnhost">移除托管</button>' : ''}</div>
        <span class="host-state" id="inHostState">${e.work ? `已托管${e.workBytes ? ' · ' + kb(e.workBytes) : ''}，打开时优先用托管的版本` : 'AI 做的单文件作品可以直接上传，一定能在房间里打开。最大 200 KB。'}</span>
        <textarea class="input code" id="inPaste" rows="5" hidden placeholder="<!doctype html> 粘贴完整的单文件 HTML"></textarea><span class="err" id="inHostErr" hidden></span></div>
      <div class="field"><label>打开方式</label><div class="seg" id="inOpen"><button type="button" data-v="embed" aria-pressed="${e.open !== 'tab'}">站内窗口</button><button type="button" data-v="tab" aria-pressed="${e.open === 'tab'}">新标签页</button></div></div>
      <div class="field"><label>窗口形状</label><div class="seg" id="inSize">${[['tall', '竖版 · 适合工具'], ['wide', '横版 · 适合游戏']].map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${(e.size || (/game/.test(e.kind) ? 'wide' : 'tall')) === v}">${l}</button>`).join('')}</div></div>` : ''}
      ${builtin && !e.art ? '' : `<div class="field"><label for="inDesc">一句话介绍</label><textarea class="input" id="inDesc" maxlength="60" rows="2">${esc(e.desc || '')}</textarea></div>`}
      ${['shiguang', 'app', 'game', 'game2', 'web'].includes(e.kind) ? `<div class="divider"></div><p class="section-t">客户端下载（可选）</p><p class="mute small u-mb3">访客打开作品时会看到适合自己设备的那一项。桌面安装包建议用 GitHub Releases 的 latest 固定链接，发新版不用改这里。</p>
      ${PLATFORMS.map(p => { const it = (e.downloads || {})[p.k] || {}; return `<div class="dl-edit"><label for="dl_${p.k}">${p.label}</label><input class="input" id="dl_${p.k}" inputmode="url" placeholder="${esc(p.ph)}" value="${esc(it.url || '')}"><input class="input" id="dlv_${p.k}" maxlength="12" placeholder="版本号" value="${esc(it.ver || '')}"></div>`; }).join('')}<span class="err" id="dlErr" hidden></span>` : ''}
    </form>`}`,
    e && !kept ? `<button type="submit" form="inForm" class="btn primary">保存绑定</button>${!builtin && !isChild ? '<button type="button" class="btn ghost" id="inUnbind">解除绑定</button>' : ''}` : '');
  const rot = $('#inRot'); if (rot) rot.addEventListener('click', () => rotateSelected());
  const sdk = $('#inSdk'); if (sdk) sdk.addEventListener('click', openSdkGuide);
  const del = $('#inDel'); if (del) del.addEventListener('click', () => deleteSelected());
  const ip = $('#inPub'); if (ip) ip.addEventListener('click', () => openPublish({ target: g.userData.iid }));
  const mk = $('#inMake'); if (mk) mk.addEventListener('click', () => { def.entry = { kind: 'web', title: nameOf(g), desc: '', url: '' }; renderInspector(g); });
  const ub = $('#inUnbind'); if (ub) ub.addEventListener('click', () => { delete def.entry; saveLayout(); rebuildFor(g); toast('已解除绑定，它又变回装饰了'); });
  let kind = kindSel, openMode = e && e.open === 'tab' ? 'tab' : 'embed', winSize = e ? (e.size || (/game/.test(e.kind) ? 'wide' : 'tall')) : 'tall';
  const segPick = (id, cb) => { const el = $(id); if (el) el.addEventListener('click', ev => { const b = ev.target.closest('button'); if (!b) return; el.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); cb(b.dataset.v); }); };
  let colorPick = (e && e.color) || '';
  const cw = $('#inColor'); if (cw) cw.addEventListener('click', ev => { const b = ev.target.closest('button'); if (!b) return; colorPick = b.dataset.c; cw.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); });
  segPick('#inOpen', v => { openMode = v; }); segPick('#inSize', v => { winSize = v; });
  const urlIn = $('#inUrl'); if (urlIn) urlIn.addEventListener('input', () => { $('#inWarn').textContent = frameDenyHint(urlIn.value); });
  let pendingHtml = null, unhost = false;
  const hostState = $('#inHostState'), hostErr = $('#inHostErr');
  const takeHtml = (html, label) => {
    hostErr.hidden = true;
    const bytes = new Blob([html]).size;
    if (bytes > WORK_MAX) { hostErr.textContent = `文件有 ${kb(bytes)}，超过了 200 KB。把图片换成链接或压缩后再试。`; hostErr.hidden = false; pendingHtml = null; return; }
    if (!/<(html|body|script|canvas|div|svg|!doctype)/i.test(html)) { hostErr.textContent = '这看起来不是 HTML，请上传 .html 文件或粘贴完整的页面代码。'; hostErr.hidden = false; pendingHtml = null; return; }
    pendingHtml = html; unhost = false; hostState.textContent = `${label} · ${kb(bytes)}，点“保存绑定”后托管`;
  };
  const fileIn = $('#inFile'); if (fileIn) fileIn.addEventListener('change', () => { const f = fileIn.files && fileIn.files[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => takeHtml(String(rd.result || ''), f.name.slice(0, 30)); rd.readAsText(f); });
  const pb = $('#inPasteBtn'); if (pb) pb.addEventListener('click', () => { const t = $('#inPaste'); t.hidden = !t.hidden; if (!t.hidden) t.focus(); });
  const ph = $('#inUnhost'); if (ph) ph.addEventListener('click', () => { unhost = true; pendingHtml = null; hostState.textContent = '保存后移除托管，改用作品地址打开'; });
  const ks = $('#inKind'); if (ks) ks.addEventListener('click', ev => { const b = ev.target.closest('button'); if (!b) return; kind = b.dataset.k; ks.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x.dataset.k === kind)); });
  const f = $('#inForm'); if (f) f.addEventListener('submit', async ev => {
    ev.preventDefault();
    const u = $('#inUrl'), err = $('#inErr');
    if (u && u.value.trim() && !validUrl(u.value)) { err.textContent = '地址需要以 http:// 或 https:// 开头，例如 https://example.com/game'; err.hidden = false; return; }
    if (err) err.hidden = true;
    if ($('#dl_win')) {
      const dls = {}; let bad = '';
      PLATFORMS.forEach(p => { const v = $('#dl_' + p.k).value.trim(), ver = $('#dlv_' + p.k).value.trim(); if (!v) return; if (!validUrl(v)) bad = p.label; else dls[p.k] = { url: v, ver }; });
      if (bad) { const de = $('#dlErr'); de.textContent = `${bad}的下载地址需要以 https:// 开头。`; de.hidden = false; return; }
      if (Object.keys(dls).length) e.downloads = dls; else delete e.downloads;
    }
    if ($('#inOpen')) { e.open = openMode; e.size = winSize; }
    const pasted = $('#inPaste') && !$('#inPaste').hidden ? $('#inPaste').value.trim() : '';
    if (!pendingHtml && pasted) { takeHtml(pasted, '粘贴的代码'); if (!pendingHtml) return; }
    if (pendingHtml) {
      const prefix = workPrefix(), wid = (e.work && e.work.startsWith(prefix) ? e.work.slice(prefix.length) : 'w' + Date.now().toString(36));
      const path = prefix + wid;
      try { await saveWork(path, $('#inTitle').value.trim() || e.title || '作品', pendingHtml); } catch (x) { hostErr.textContent = '托管没成功，稍后再试。'; hostErr.hidden = false; return; }
      e.work = path; e.workBytes = new Blob([pendingHtml]).size; e.open = 'embed';
    } else if (unhost) { delete e.work; delete e.workBytes; }
    if (!builtin) e.kind = kind || 'web';
    if (!builtin || e.art) { const d = $('#inDesc'); if (d) e.desc = d.value.trim(); }
    if (!builtin) { if (colorPick) e.color = colorPick; else delete e.color; }
    e.title = $('#inTitle').value.trim() || e.title || '未命名作品';
    if (u) e.url = u.value.trim();
    saveLayout(); rebuildFor(g); toast(CLOUD.ready ? '已保存到社区，切回漫游点它试试' : '已保存，切回漫游点它试试');
  });
}
function rebuildFor(g) {
  const root = g.userData.isChild ? findGroup(g.userData.parentDef.uid) : g;
  const def = root.userData.def, iid = g.userData.iid;
  S.roomRoot.remove(root);
  placeItem(def);
  const ng = findGroup(iid);
  if (ng && S.mode === 'build') selectItem(ng);
  refreshHotspots();
}
function rotateSelected() {
  const g = S.selected; if (!g || g.userData.def.wall || g.userData.isChild) return;
  const def = g.userData.def; def.rot = ((def.rot || 0) + 1) % 4; def.ry = 0;
  clampDef(def); positionItem(g, def); saveLayout(); selectItem(g);
}
function deleteSelected() {
  const g = S.selected; if (!g || g.userData.def.wall || g.userData.isChild || (g.userData.meta || {}).nodelete) return;
  const def = g.userData.def; S.room.items = S.room.items.filter(d => d !== def);
  S.roomRoot.remove(g); S.itemGroups.delete(def.uid); closePanel(true); S.selected = null; S.selRing.visible = false; saveLayout(); toast(`已移走「${nameOf(g)}」`);
}
function clampDef(def) {
  const meta = ITEMS[def.type] || {}, odd = (def.rot || 0) % 2;
  const hw = ((odd ? meta.d : meta.w) || 1) / 2, hd = ((odd ? meta.w : meta.d) || 1) / 2;
  def.x = clamp(def.x, -5 + hw, 5 - hw); def.z = clamp(def.z, -4 + hd, 4 - hd);
}
let layoutT = 0;
function writeSite(patch) { const d = Object.assign(clone(CLOUD.site || {}), patch, { ownerId: CLOUD.me.id, updatedAt: Date.now() }); CLOUD.site = d; return cloudWrite('site/room302', d); }
function saveLayout() {
  if (!S.room || !S.room.mine) return;
  if (S.mode === 'build') setTimeout(renderPendingRow, 0);
  const items = clone(S.room.items);
  if (CLOUD.ready && S.room.uid && S.room.uid === CLOUD.me.id) {
    clearTimeout(layoutT); layoutT = setTimeout(() => { const d = clone(CLOUD.rooms.get(CLOUD.me.id) || {}); if (!d.no) return; d.items = items; d.updatedAt = Date.now(); CLOUD.rooms.set(CLOUD.me.id, d); cloudWrite(`rooms/${CLOUD.me.id}`, d).catch(() => {}); }, 700);
    return;
  }
  if (CLOUD.ready && S.room.id === 'mine' && CLOUD.isOwner) { clearTimeout(layoutT); layoutT = setTimeout(() => writeSite({ items }).catch(() => {}), 700); return; }
  if (S.room.id.startsWith('custom-')) { CUSTOM[S.room.no] = clone(S.room); store.set('gebi3.custom', CUSTOM); } else store.set('gebi3.room.' + S.room.id, S.room.items);
}
function addFromCatalog(type) {
  const meta = ITEMS[type], sp = freeSpot(S.room.items);
  const def = { uid: type + Date.now().toString(36), type, x: sp.x, z: sp.z, rot: 0 };
  if (meta.entry) def.entry = clone(meta.entry);
  clampDef(def); S.room.items.push(def);
  const g = placeItem(def); saveLayout(); selectItem(g);
  toast(`放好了一件${meta.name}，拖动它换个位置`);
}

