/* 本地开发用：模拟 claude.ai artifact 运行时的 db 与 user 能力，数据存在 localStorage。仅用于 dev/serve.py --mock，不会随页面发布。 */
(function(){
  const K='mockdb';
  const load=()=>{try{return JSON.parse(localStorage.getItem(K)||'{}')}catch(e){return {}}};
  const save=d=>localStorage.setItem(K,JSON.stringify(d));
  const subs=[];
  function snapDoc(path){const d=load()[path];return {id:path.split('/').pop(),exists:!!d,data:()=>d?JSON.parse(JSON.stringify(d)):undefined,metadata:{fromCache:false,hasPendingWrites:false}};}
  function collDocs(path){const d=load(),n=path.split('/').length+1;return Object.keys(d).filter(p=>p.startsWith(path+'/')&&p.split('/').length===n).sort().map(snapDoc);}
  function fire(){subs.forEach(s=>s());}
  setInterval(fire,700);
  const params=new URLSearchParams(location.search);
  const me={id:params.get('uid')||'u_owner',isOwner:params.get('owner')!=='0',canEdit:true,name:params.get('name')||'测试用户',email:null,avatarUrl:'',color:'#fa0'};
  window.__writes=[];
  const db={
    doc(path){ if(path.split('/').length%2) throw new TypeError('odd '+path); return {id:path.split('/').pop(),path,
      get:async()=>snapDoc(path),
      set:async(b)=>{ if(JSON.stringify(b).length>256*1024) throw {code:'invalid_argument'}; const d=load(); d[path]=b; save(d); window.__writes.push(path); fire(); },
      update:async(b)=>{const d=load(); if(!d[path]) throw {code:'invalid_argument'}; Object.assign(d[path],b); save(d); fire();},
      delete:async()=>{const d=load(); delete d[path]; save(d); fire();},
      onSnapshot(next){let last=null;const s=()=>{const sd=snapDoc(path),j=JSON.stringify(sd.data()||null); if(j!==last){last=j;next(sd);}};subs.push(s);setTimeout(s,50);return ()=>{};},
      collection:(p)=>db.collection(path+'/'+p)};},
    collection(path){ return {path, doc:(id)=>db.doc(path+'/'+(id||Math.random().toString(36).slice(2))),
      onSnapshot(next){let last=null;const s=()=>{const docs=collDocs(path),j=JSON.stringify(docs.map(d=>[d.id,d.data()])); if(j!==last){last=j;next({docs,size:docs.length,empty:!docs.length,docChanges:()=>[],metadata:{}});}};subs.push(s);setTimeout(s,50);return ()=>{};},
      get:async()=>{const docs=collDocs(path);return {docs,size:docs.length,empty:!docs.length};}};}
  };
  const user={me:async()=>me,id:async()=>me.id,isOwner:async()=>me.isOwner,canEdit:async()=>true,can:async()=>params.get('ro')==='1'?false:true,
    profiles:async(ids)=>Object.fromEntries([].concat(ids).map(i=>[i,{id:i,name:i==='u_owner'?'大K':i==='u_guest'?'小鱼':'',avatarUrl:'',color:'#888',email:null,isMe:i===me.id,guest:false}]))};
  // assets：和真实运行时一样只收这些类型、单个 20 MiB，文件经 dev/serve.py 存在 dev/.blobs/
  const ACCEPT=/^(image\/|video\/|font\/)|^(application\/pdf|text\/csv|text\/markdown|text\/plain|application\/json|text\/css|text\/javascript)$/;
  const assets={upload:async(blob,o)=>{const type=(o&&o.type)||blob.type;if(!ACCEPT.test(type||''))throw {code:'unsupported_type',message:type};if(blob.size>20*1024*1024)throw {code:'too_large',message:'20 MiB'};
      const id=Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');
      const r=await fetch('/_blob/'+id,{method:'PUT',headers:{'content-type':type},body:blob});if(!r.ok)throw {code:'store_unavailable',message:String(r.status)};
      return {id,url:'/_blob/'+id,sizeBytes:blob.size,contentType:type};},
    list:async()=>({assets:[],usage:{files:0,bytes:0,maxFiles:1000,maxBytes:1e9}}),delete:async()=>({deleted:true})};
  // sample：加 ?sample=1 时模拟 Bit，只会按发布台的提示词回一段 JSON
  const sample=Object.assign(async(input)=>{const s=typeof input==='string'?input:input.map(m=>m.content).join('\n');const t=(/现在的名称：(.*)/.exec(s)||[])[1]||'作品';const c=JSON.parse((/从 (\[.*?\]) 里选/.exec(s)||[0,'["kiosk"]'])[1]);
      return {text:JSON.stringify({title:t.trim().slice(0,12),desc:'（模拟的 Bit）'+t.trim()+'的一句话介绍',carrier:c[0]}),truncated:false};},{limits:async()=>({images:false,tools:false})});
  window.claude={use:async(n)=>n==='db'?db:n==='user'?user:n==='assets'?(params.get('ro')==='1'?null:assets):n==='sample'&&params.get('sample')==='1'?sample:null};
})();
