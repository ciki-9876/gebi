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
  window.claude={use:async(n)=>n==='db'?db:n==='user'?user:null};
})();
