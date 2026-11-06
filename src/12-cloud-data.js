/* ============================================================
   Data layer: the only file that talks to the platform.
   Today it is the claude.ai artifact runtime (db, user, assets,
   downloads, sample). Moving to our own backend (stage 3 in
   docs/ARCHITECTURE.md) means rewriting this file only; every
   other file goes through DATA.
   ============================================================ */
const DATA = (() => {
  const rt = () => (window.claude && window.claude.use) ? window.claude : null;
  const use = name => { const c = rt(); return c ? c.use(name).catch(() => null) : Promise.resolve(null); };
  let db = null, user = null, assetsP = null;
  const docMap = s => new Map(s.docs.filter(d => d.exists).map(d => [d.id, d.data()]));
  return {
    // 有没有平台：没有时页面退回浏览器本地存储
    available: () => !!rt(),
    // 登录并连上数据库。返回 { id, isOwner, canWrite }；连不上返回 null
    async connect() {
      if (!rt()) return null;
      const [d, u] = await Promise.all([use('db'), use('user')]);
      if (!d || !u) return null;
      const me = await u.me(); if (!me || !me.id) return null;
      db = d; user = u;
      return { id: me.id, isOwner: !!me.isOwner, canWrite: await u.can('data.write') };
    },
    // 读一个文档：不存在返回 null，出错抛出
    async get(path) { const s = await db.doc(path).get(); return s.exists ? s.data() : null; },
    // 整个覆盖写入。失败时抛出带 code 的错误：invalid_argument（没有写权限或格式不对）、
    // quota_exceeded、resource_exhausted、revoked。换后端时把错误映射成这几个 code，cloudWrite() 靠它们给提示
    set(path, body) { return db.doc(path).set(body); },
    // 订阅一个文档：cb(data | null)
    watchDoc(path, cb, onErr) { return db.doc(path).onSnapshot(s => cb(s.exists ? s.data() : null), onErr); },
    // 订阅一个集合的直接子文档：cb(Map<id, data>)
    watchCollection(path, cb, onErr) { return db.collection(path).onSnapshot(s => cb(docMap(s)), onErr); },
    // 用户 id → { name }，名字取不到时为空字符串
    profiles(ids) { return user ? user.profiles(ids) : Promise.resolve({}); },
    // 上传文件，返回文件 id；平台不可用返回 null（调用方给提示），上传失败抛出带 code 的错误
    async upload(blob, type) {
      if (!db) return null;
      if (!assetsP) assetsP = use('assets');
      const a = await assetsP; if (!a) return null;
      return (await a.upload(blob, { type })).id;
    },
    // 文件 id → 可以放进 <img>/<video>/fetch 的地址
    fileUrl: id => '/_blob/' + id,
    // 让浏览者保存一个文件：返回 true 已保存；false 平台不支持（调用方自己退回普通下载）；
    // 浏览者取消时抛出 code 为 declined 的错误
    async save(filename, data) {
      const dl = await use('downloads'); if (!dl) return false;
      await dl.save({ filename, data }); return true;
    },
    // 房间里的 AI（Bit）用的模型调用。不是数据，但同样来自平台，换后端时一并替换
    sample: () => use('sample'),
  };
})();
