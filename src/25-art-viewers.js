/* ============================================================
   AI artifacts · viewers: what opens when you click a carrier.
   Media plays in the page; anything made of someone's text
   (Markdown, code, projects) renders inside a sandboxed iframe,
   never as HTML in this page.
   ============================================================ */
const DOC_CSS = 'body{margin:0;padding:28px 32px 48px;font:15px/1.75 -apple-system,"PingFang SC","Noto Sans SC","Microsoft YaHei",system-ui,sans-serif;color:#24221e;background:#fbf8f1;max-width:760px;margin:0 auto}h1,h2,h3,h4{line-height:1.3;margin:1.4em 0 .5em}h1{font-size:1.8em}h2{font-size:1.4em;border-bottom:1px solid #e6dfd0;padding-bottom:.3em}pre{background:#1d1f27;color:#e8e4f0;padding:14px 16px;border-radius:8px;overflow:auto;font:13px/1.6 ui-monospace,Menlo,Consolas,monospace}code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.92em;background:#efe8d8;padding:.1em .35em;border-radius:4px}pre code{background:none;padding:0}blockquote{margin:1em 0;padding:.2em 1em;border-left:4px solid #d9cdb2;color:#5b5446}img{max-width:100%}table{border-collapse:collapse;margin:1em 0;font-size:14px}th,td{border:1px solid #e0d7c3;padding:6px 10px;text-align:left}th{background:#f1ead9}a{color:#3d5afe}hr{border:0;border-top:1px solid #e0d7c3;margin:2em 0}.ln{display:inline-block;width:3.2em;color:#6c7393;user-select:none}';
function mdInline(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g, '<img src="$2" alt="$1" loading="lazy">')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, '$1<i>$2</i>');
}
function mdToHtml(src) {
  const L = String(src || '').replace(/\r\n?/g, '\n').split('\n'), out = [];
  let i = 0, para = [];
  const flush = () => { if (para.length) { out.push('<p>' + mdInline(para.join(' ')) + '</p>'); para = []; } };
  while (i < L.length) {
    const l = L[i];
    if (/^```/.test(l)) { flush(); const buf = []; i++; while (i < L.length && !/^```/.test(L[i])) buf.push(L[i++]); i++; out.push('<pre><code>' + esc(buf.join('\n')) + '</code></pre>'); continue; }
    let m;
    if ((m = /^(#{1,6})\s+(.*)$/.exec(l))) { flush(); out.push(`<h${m[1].length}>${mdInline(m[2])}</h${m[1].length}>`); i++; continue; }
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(l)) { flush(); out.push('<hr>'); i++; continue; }
    if (/^>\s?/.test(l)) { flush(); const buf = []; while (i < L.length && /^>\s?/.test(L[i])) buf.push(L[i++].replace(/^>\s?/, '')); out.push('<blockquote>' + mdToHtml(buf.join('\n')) + '</blockquote>'); continue; }
    if (/^\s*([-*+]|\d+[.)])\s+/.test(l)) {
      flush(); const ol = /^\s*\d/.test(l), buf = [];
      while (i < L.length && /^\s*([-*+]|\d+[.)])\s+/.test(L[i])) buf.push('<li>' + mdInline(L[i++].replace(/^\s*([-*+]|\d+[.)])\s+(\[[ x]\]\s*)?/, '')) + '</li>');
      out.push(`<${ol ? 'ol' : 'ul'}>${buf.join('')}</${ol ? 'ol' : 'ul'}>`); continue;
    }
    if (/^\|.*\|\s*$/.test(l) && /^\|?\s*:?-{2,}/.test(L[i + 1] || '')) {
      flush(); const row = (r, tag) => '<tr>' + r.replace(/^\||\|\s*$/g, '').split('|').map(c => `<${tag}>${mdInline(c.trim())}</${tag}>`).join('') + '</tr>';
      const buf = [row(l, 'th')]; i += 2; while (i < L.length && /^\|.*\|\s*$/.test(L[i])) buf.push(row(L[i++], 'td'));
      out.push('<table>' + buf.join('') + '</table>'); continue;
    }
    if (!l.trim()) { flush(); i++; continue; }
    para.push(l.trim()); i++;
  }
  flush(); return out.join('\n');
}
function codeHtml(text, name) {
  const ext = extOf(name);
  if (ext === 'json') { try { text = JSON.stringify(JSON.parse(text), null, 2); } catch (e) {} }
  if (ext === 'csv' || ext === 'tsv') {
    const sep = ext === 'tsv' ? '\t' : ',', rows = text.split(/\r?\n/).filter(Boolean).slice(0, 300).map(r => r.split(sep));
    if (rows.length > 1) return '<table>' + rows.map((r, k) => '<tr>' + r.map(c => `<${k ? 'td' : 'th'}>${esc(c.replace(/^"|"$/g, ''))}</${k ? 'td' : 'th'}>`).join('') + '</tr>').join('') + '</table>';
  }
  return '<pre><code>' + text.split('\n').slice(0, 5000).map((l, k) => `<span class="ln">${k + 1}</span>${esc(l)}`).join('\n') + '</code></pre>';
}
// 静态文档：沙箱里不允许脚本，只允许新标签页打开链接
function staticDoc(inner, title) { return `<!doctype html><html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title || '')}</title><style>${DOC_CSS}</style></head><body>${inner}</body></html>`; }
function sandboxFrame(html, scripts) {
  const f = document.createElement('iframe'); f.className = 'art-frame';
  f.setAttribute('sandbox', scripts ? 'allow-scripts allow-forms allow-modals allow-pointer-lock allow-popups' : 'allow-popups allow-popups-to-escape-sandbox');
  f.setAttribute('allow', scripts ? 'fullscreen; gamepad; autoplay' : ''); f.srcdoc = html; return f;
}
function isMd(name, text) { return /\.(md|markdown)$/i.test(name || '') || (!extOf(name) && /^#{1,6} |\n#{1,6} |\n[-*] /.test(text || '')); }

/* ---------- running a project ---------- */
function projResolve(from, rel) {
  if (!rel || /^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(rel)) return null;
  const parts = rel[0] === '/' ? [] : from.split('/').slice(0, -1);
  for (const p of rel.split(/[?#]/)[0].split('/')) { if (!p || p === '.') continue; if (p === '..') parts.pop(); else parts.push(decodeURIComponent(p)); }
  return parts.join('/');
}
async function projDataUrl(proj, path, memo) {
  if (memo.has(path)) return memo.get(path);
  const f = proj.files.get(path); let u = null;
  if (f && f.text != null) u = 'data:' + mimeOf(path, 'text/plain') + ';charset=utf-8,' + encodeURIComponent(f.text);
  else if (f && f.b64) u = `data:${f.mime};base64,${f.b64}`;
  else if (f && f.asset) { try { const b = await (await fetch(await artUrl({ asset: f.asset }))).blob(); u = await new Promise(r => { const rd = new FileReader(); rd.onload = () => r(rd.result); rd.onerror = () => r(null); rd.readAsDataURL(b); }); } catch (e) { u = null; } }
  memo.set(path, u); return u;
}
async function projCss(proj, path, css, memo) {
  const urls = [...new Set([...css.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)].map(m => m[1]))];
  for (const u of urls) { const p = projResolve(path, u); const d = p && await projDataUrl(proj, p, memo); if (d) css = css.split(u).join(d); }
  return css;
}
async function projModule(proj, path, memo, seen) {
  const key = 'm:' + path; if (memo.has(key)) return memo.get(key);
  const f = proj.files.get(path); if (!f || f.text == null) return null;
  seen.add(path); let src = f.text;
  const specs = [...new Set([...src.matchAll(/(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(?\s*['"]([^'"]+)['"]/g)].map(m => m[1] || m[2]))];
  for (const s of specs) {
    const p = projResolve(path, s); if (!p || !/^\.{0,2}\//.test(s)) continue;
    const d = seen.has(p) ? null : await projModule(proj, p, memo, seen);
    if (d) src = src.split(`'${s}'`).join(`'${d}'`).split(`"${s}"`).join(`"${d}"`);
  }
  const u = 'data:text/javascript;charset=utf-8,' + encodeURIComponent(src); memo.set(key, u); return u;
}
async function projPage(proj, path) {
  const f = proj.files.get(path); if (!f || f.text == null) return null;
  const memo = new Map(), noScript = s => s.replace(/<\/script/gi, '<\\/script');
  let html = f.text;
  for (const m of [...html.matchAll(/<script\b([^>]*?)\ssrc=["']([^"']+)["']([^>]*)>\s*<\/script>/gi)]) {
    const p = projResolve(path, m[2]); if (!p || !proj.files.has(p)) continue;
    const mod = /type=["']module["']/i.test(m[1] + m[3]);
    const body = mod ? `import '${await projModule(proj, p, memo, new Set())}';` : noScript(proj.files.get(p).text || '');
    html = html.split(m[0]).join(`<script${mod ? ' type="module"' : ''}>${body}</script>`);
  }
  for (const m of [...html.matchAll(/<script\b[^>]*type=["']module["'][^>]*>([\s\S]*?)<\/script>/gi)]) {
    if (!/\bfrom\s*['"]\.|import\s*\(?\s*['"]\./.test(m[1])) continue;
    proj.files.set(path + '#inline', { text: m[1] });
    const u = await projModule(proj, path + '#inline', memo, new Set()); proj.files.delete(path + '#inline');
    html = html.split(m[0]).join(`<script type="module">import '${u}';</script>`);
  }
  for (const m of [...html.matchAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*>/gi)]) {
    const h = /href=["']([^"']+)["']/i.exec(m[0]), p = h && projResolve(path, h[1]);
    if (p && proj.files.has(p)) html = html.split(m[0]).join(`<style>${(await projCss(proj, p, proj.files.get(p).text || '', memo)).replace(/<\/style/gi, '<\\/style')}</style>`);
  }
  for (const m of [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)]) html = html.split(m[1]).join(await projCss(proj, path, m[1], memo));
  for (const m of [...html.matchAll(/\s(src|href|poster)=["']([^"']+)["']/gi)]) {
    const p = projResolve(path, m[2]); if (!p || /\.html?$/i.test(p) || !proj.files.has(p)) continue;
    const d = await projDataUrl(proj, p, memo); if (d) html = html.split(m[0]).join(` ${m[1]}="${d}"`);
  }
  const texts = {}; proj.files.forEach((v, k) => { if (v.text != null && !/\.html?$/i.test(k) && v.text.length < 200000) texts[k] = v.text; });
  const shim = `<script>(function(){var F=${noScript(JSON.stringify(texts))},C=${JSON.stringify(path)};function R(s){if(!s||/^([a-z][a-z0-9+.-]*:|\\/\\/|#)/i.test(s))return null;var a=s[0]==='/'?[]:C.split('/').slice(0,-1);s.split(/[?#]/)[0].split('/').forEach(function(p){if(!p||p==='.')return;if(p==='..')a.pop();else a.push(decodeURIComponent(p));});return a.join('/');}
var of=window.fetch;window.fetch=function(u,o){var p=R(typeof u==='string'?u:(u&&u.url)||'');if(p!=null&&F[p]!=null)return Promise.resolve(new Response(F[p],{headers:{'content-type':'text/plain;charset=utf-8'}}));return of.apply(this,arguments);};
document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a[href]');if(!a)return;var p=R(a.getAttribute('href'));if(p&&/\\.html?$/i.test(p)){e.preventDefault();parent.postMessage({gebiArt:1,nav:p},'*');}},true);})();</script>`;
  return /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, h => h + shim) : shim + html;
}

/* ---------- rendering an artifact into an element ---------- */
async function artDownload(e) {
  const art = e.art, u = await artUrl(art), name = art.name || (e.title || 'file');
  if (!u) return toast('文件没找到');
  try {
    const dl = CLOUD.ready && window.claude && window.claude.use ? await window.claude.use('downloads') : null;
    if (dl) { const b = await (await fetch(u)).blob(); await dl.save({ filename: name, data: b }); return; }
  } catch (x) { if (x && x.code === 'declined') return; }
  const a = document.createElement('a'); a.href = u; a.download = name; a.target = '_blank'; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove();
}
function artInfo(e) {
  const a = e.art || {}; return [ART_TYPES[a.t] && ART_TYPES[a.t].label, a.bytes ? mb(a.bytes) : '', a.made ? '用 ' + a.made + ' 做的' : ''].filter(Boolean).join(' · ');
}
async function renderArt(box, e, opts = {}) {
  const a = e.art; box.innerHTML = '<div class="art-wait"><div class="bar-anim"><i></i></div></div>';
  const fail = msg => { box.innerHTML = `<div class="empty"><b>打不开</b><p>${esc(msg)}</p></div>`; };
  const u = ['image', 'video', 'audio', 'pdf', 'model', 'file'].includes(a.t) ? await artUrl(a) : '';
  if (a.t === 'image') { box.innerHTML = `<div class="art-stage"><img class="art-img" alt="${esc(e.title || '')}" src="${esc(u)}"></div>`; const im = box.querySelector('img'); im.onerror = () => fail('图片没有加载出来。参与者上传的文件只对同一组织的成员可见。'); im.addEventListener('click', () => box.firstElementChild.classList.toggle('full')); return; }
  if (a.t === 'video') { box.innerHTML = `<div class="art-stage"><video class="art-video" controls playsinline preload="metadata" src="${esc(u)}"></video></div>`; return; }
  if (a.t === 'audio') {
    box.innerHTML = `<div class="art-audio"><div class="art-disc"></div><b>${esc(e.title || '音乐')}</b><p class="mute">${esc(e.desc || '')}</p><audio controls preload="metadata" src="${esc(u)}"></audio></div>`;
    const au = box.querySelector('audio'); au.addEventListener('play', () => { S.artPlaying = opts.uid || null; box.classList.add('playing'); }); au.addEventListener('pause', () => { S.artPlaying = null; box.classList.remove('playing'); }); return;
  }
  if (a.t === 'pdf') { box.innerHTML = `<object class="art-pdf" type="application/pdf" data="${esc(u)}"><div class="empty"><b>这里显示不了 PDF</b><p><a class="btn sm" href="${esc(u)}" target="_blank" rel="noopener">在新标签页打开 ${ICON.ext}</a></p></div></object>`; return; }
  if (a.t === 'model' || a.t === 'file') {
    box.innerHTML = `<div class="empty"><b>${esc(a.name || e.title || '文件')}</b><p>${esc(artInfo(e))}</p><p>${a.t === 'model' ? '模型摆在房间的展台上，走近就能看到。' : '这个文件可以下载到自己的设备上打开。'}</p><p class="u-row u-center"><button type="button" class="btn sm" data-x="dl">下载</button>${a.t === 'model' && opts.g ? '<button type="button" class="btn sm ghost" data-x="look">走近看看</button>' : ''}</p></div>`;
    box.querySelector('[data-x="dl"]').addEventListener('click', () => artDownload(e));
    const lk = box.querySelector('[data-x="look"]'); if (lk) lk.addEventListener('click', () => { if (S.win) minimizeWin(S.win, true); focusOn(opts.g, { loose: true }); });
    return;
  }
  if (a.t === 'doc' || a.t === 'data') {
    const text = await loadArtText(a); if (text == null) return fail('文件没找到，可能已经被移除了。');
    const inner = a.t === 'doc' && isMd(a.name, text) ? mdToHtml(text) : a.t === 'doc' ? `<pre class="plain">${esc(text)}</pre>` : codeHtml(text, a.name);
    box.innerHTML = ''; box.appendChild(sandboxFrame(staticDoc(inner, e.title))); return;
  }
  if (a.t === 'project') return renderProject(box, e, opts);
  fail('不认识这种作品。');
}
async function renderProject(box, e, opts) {
  const proj = await loadProject(e.art.work);
  if (!proj) { box.innerHTML = '<div class="empty"><b>项目没找到</b><p>可能已经被房主移除了。</p></div>'; return; }
  const paths = [...proj.files.keys()].sort((x, y) => (x.split('/').length - y.split('/').length) || x.localeCompare(y));
  box.innerHTML = `<div class="art-proj"><div class="art-proj-bar">${proj.entry ? '<button type="button" class="btn sm primary" data-x="run">▶ 运行</button>' : ''}<span class="mute small">${paths.length} 个文件 · ${esc(mb(proj.bytes))}${proj.skipped.length ? ` · 跳过了 ${proj.skipped.length} 个` : ''}</span></div>
    <div class="art-proj-main"><nav class="art-tree" aria-label="项目文件">${paths.map(p => { const i = p.lastIndexOf('/') + 1; return `<button type="button" data-p="${esc(p)}"><span class="mute">${esc(p.slice(0, i))}</span>${esc(p.slice(i))}</button>`; }).join('')}</nav><div class="art-pane"></div></div></div>`;
  const pane = box.querySelector('.art-pane'), tree = box.querySelector('.art-tree');
  const mark = p => tree.querySelectorAll('button').forEach(b => b.setAttribute('aria-current', b.dataset.p === p));
  const show = async p => {
    mark(p); const f = proj.files.get(p); pane.innerHTML = '';
    if (f.text != null) pane.appendChild(sandboxFrame(staticDoc(isMd(p, f.text) ? mdToHtml(f.text) : codeHtml(f.text, p), p)));
    else if (/^image\//.test(f.mime)) { const d = await projDataUrl(proj, p, new Map()); pane.innerHTML = d ? `<div class="art-stage"><img class="art-img" alt="${esc(p)}" src="${esc(d)}"></div>` : '<div class="empty"><p>图片没有加载出来</p></div>'; }
    else pane.innerHTML = `<div class="empty"><b>${esc(p)}</b><p>${esc(f.mime)} · ${esc(mb(f.size))}</p></div>`;
  };
  const run = async page => {
    mark(''); pane.innerHTML = '<div class="art-wait"><div class="bar-anim"><i></i></div></div>';
    const html = await projPage(proj, page || proj.entry);
    pane.innerHTML = ''; if (!html) { pane.innerHTML = '<div class="empty"><p>入口页面没找到</p></div>'; return; }
    const f = sandboxFrame(html, true); pane.appendChild(f);
    const onMsg = ev => { if (ev.source === f.contentWindow && ev.data && ev.data.gebiArt === 1 && typeof ev.data.nav === 'string' && proj.files.has(ev.data.nav)) run(ev.data.nav); };
    window.addEventListener('message', onMsg);
    const stop = new MutationObserver(() => { if (!f.isConnected) { window.removeEventListener('message', onMsg); stop.disconnect(); } }); stop.observe(pane, { childList: true });
  };
  tree.addEventListener('click', ev => { const b = ev.target.closest('[data-p]'); if (b) show(b.dataset.p); });
  const rb = box.querySelector('[data-x="run"]'); if (rb) rb.addEventListener('click', () => run());
  if (proj.readme) show(proj.readme); else if (proj.entry && opts.autorun !== false) run(); else if (paths[0]) show(paths[0]);
}

/* ---------- window for an artifact ---------- */
function createArtWin(g, e) {
  const iid = g.userData.iid, kc = KIND_COLOR[e.kind] || KIND_COLOR.file, a = e.art;
  const size = ['audio', 'model', 'file'].includes(a.t) ? 'tall' : 'wide';
  const el = document.createElement('section');
  el.className = 'win ' + size; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', e.title || '作品');
  el.innerHTML = `<header class="win-bar"><i class="win-dot" style="background:linear-gradient(135deg,${kc[0]},${kc[1]})"></i>
    <div class="win-t"><b>${esc(e.title || '作品')}</b><span class="win-sub"><span class="win-host">${esc(artInfo(e) || '隔壁托管')}${e.from ? ` · ${e.from.adapted ? '改编自' : '收藏自'} ${esc(e.from.by || '邻居')}` : ''}</span></span></div>
    <div class="win-act">${curateOK(e) ? '<button type="button" class="win-get" data-a="collect">☆ 收藏</button>' : ''}
    ${['image', 'video', 'audio', 'pdf', 'model', 'file', 'doc', 'data'].includes(a.t) ? '<button type="button" class="win-get" data-a="dl">下载</button>' : ''}
    <button type="button" class="wbtn" data-a="min" aria-label="收起到任务栏">${WICON.min}</button>
    <button type="button" class="wbtn x" data-a="close" aria-label="关闭">${WICON.x}</button></div></header>
    <div class="win-body"><div class="art-view"></div></div>`;
  const w = { iid, g, e, el, iframe: null, size, src: { art: true }, origin: '*', kind: e.kind, sdk: true, loaded: true, timers: [], art: true };
  el.addEventListener('click', ev => {
    const b = ev.target.closest('[data-a]'); if (!b) return;
    const act = b.dataset.a;
    if (act === 'min') minimizeWin(w); else if (act === 'close') closeWin(w);
    else if (act === 'collect') collectEntry(e); else if (act === 'dl') artDownload(e);
  });
  w.onClose = () => { if (S.artPlaying === g.userData.def.uid) S.artPlaying = null; };
  renderArt(el.querySelector('.art-view'), e, { g, uid: g.userData.def.uid });
  winsEl.appendChild(el);
  return w;
}
