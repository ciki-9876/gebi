/* ============================================================
   Rooms (first-person layout: x −5…5, z −4…4, ceiling 4.8)
   ============================================================ */
const DOOR = (u) => ({ uid: 'door', type: 'door', wall: 'front', u, y: 0, entry: { kind: 'door', title: '出门 · 回到地球', desc: '' } });
const ROOM_PRESETS = {
  mine: {
    id: 'mine', no: '302', name: '零点电竞酒吧', owner: '你', mine: true, agent: true,
    theme: { wall: '#2a2140', trim: '#3c2f58', floor: 'wood', floorTint: '#4f3426', neon: 'MIDNIGHT 302', neonColor: '#ff5aa8', bean: '#2f6f73', sofa: '#5b3a6b', rug: ['#2e1d45', '#ff5aa8', '#62e6ff', '#22163a'] },
    items: [
      { uid: 'rug', type: 'rug', x: .5, z: 1.1 },
      { uid: 'bar', type: 'barCounter', x: 2.4, z: -2.0, rot: 0 },
      { uid: 'robot', type: 'robot', x: 2.4, z: -3.2, rot: 0, entry: { kind: 'agent', title: '酒保 Bit', desc: '房主配置的 AI 助手' } },
      { uid: 'stool1', type: 'stool', x: 1.1, z: -.85 }, { uid: 'stool2', type: 'stool', x: 2.4, z: -.85 }, { uid: 'stool3', type: 'stool', x: 3.7, z: -.85 },
      { uid: 'desk', type: 'desk', x: -4.22, z: -1.75, rot: 1 },
      { uid: 'chair', type: 'chair', x: -2.95, z: -1.9, rot: 3, ry: .35 },
      { uid: 'beanbag', type: 'beanbag', x: -.95, z: 1.6, ry: .7 },
      { uid: 'table', type: 'coffeeTable', x: .7, z: 1.05 },
      { uid: 'sofa', type: 'sofa', x: 4.35, z: .7, rot: 3 },
      { uid: 'plant', type: 'plant', x: 4.4, z: 3.4 }, { uid: 'plant2', type: 'plant', x: -4.4, z: 3.4 },
      { uid: 'lamp', type: 'floorLamp', x: 4.45, z: 2.55 },
      { uid: 'shelf', type: 'backShelf', wall: 'back', u: 2.4, y: 0 },
      { uid: 'pegboard', type: 'pegboard', wall: 'left', u: 1.95, y: 2.45 },
      { uid: 'neon', type: 'neon', wall: 'back', u: -1.7, y: 3.6 },
      { uid: 'chalkboard', type: 'chalkboard', wall: 'back', u: -1.7, y: 1.85, entry: { kind: 'guestbook', title: '留言黑板', desc: '' } },
      DOOR(-1.0)
    ]
  },
  pixel: {
    id: 'pixel', no: '204', name: '像素工坊', owner: '@pixelmo',
    theme: { wall: '#1b3442', trim: '#2b4b5c', floor: 'tile', floorTint: '#3a3f4e', neon: 'PIXEL WORKS', neonColor: '#62e6ff', arcade: '#3b2a6b', bean: '#d4573d', sofa: '#2f4f6f', rug: ['#203545', '#62e6ff', '#ffb454', '#162a36'] },
    items: [
      { uid: 'rug', type: 'rug', x: .8, z: 1.4 },
      { uid: 'a1', type: 'arcade', x: -3.9, z: -3.4, entry: { kind: 'game2', title: '像素躲避球', desc: '双人同屏的躲避球，30 秒一局', url: '' } },
      { uid: 'a2', type: 'arcade', x: -2.75, z: -3.4, entry: { kind: 'game2', title: '1-bit 地牢', desc: '只有黑白两色的 roguelike', url: '', color: '#d4573d' } },
      { uid: 'k1', type: 'kiosk', x: 1.6, z: -2.2, ry: -.3, entry: { kind: 'app', title: '调色板生成器', desc: '上传一张图，导出 16 色像素调色板', url: '' } },
      { uid: 'bs', type: 'bookshelf', x: 3.9, z: -3.55 },
      { uid: 'desk', type: 'desk', x: -4.22, z: .6, rot: 1, opts: { console: false } },
      { uid: 'ch', type: 'chair', x: -2.9, z: .5, rot: 3, ry: .4 },
      { uid: 'bb', type: 'beanbag', x: 1.2, z: 1.9 },
      { uid: 'pl', type: 'plant', x: 4.3, z: 3.3 }, { uid: 'lp', type: 'floorLamp', x: 4.4, z: -2.5 },
      { uid: 'neon', type: 'neon', wall: 'back', u: 1.2, y: 3.6 }, DOOR(-2.4)
    ]
  },
  leaf: {
    id: 'leaf', no: '101', name: '植物温室', owner: '@leafcode',
    theme: { wall: '#1f3a2c', trim: '#2f5440', floor: 'wood', floorTint: '#7a5a3c', neon: 'GREENHOUSE', neonColor: '#7ee0a1', sofa: '#c7a26b', bean: '#3f8f5a', rug: ['#2a4a38', '#7ee0a1', '#ffd36b', '#1d3428'] },
    items: [
      { uid: 'rug', type: 'rug', x: .4, z: .9 },
      { uid: 'sofa', type: 'sofa', x: .4, z: 2.6, rot: 2 },
      { uid: 'k1', type: 'kiosk', x: -2.2, z: -2.6, ry: .3, entry: { kind: 'app', title: '浇水提醒', desc: '按植物品种和天气推送浇水时间', url: '' } },
      { uid: 'wb', type: 'whiteboard', x: 1.6, z: -3.4, entry: { kind: 'repo', title: '植物图鉴 API', desc: '开源的植物识别与养护数据接口', url: '' } },
      { uid: 'bs', type: 'bookshelf', x: -4.5, z: .6, rot: 1 },
      { uid: 'p1', type: 'plant', x: -4.3, z: -3.3 }, { uid: 'p2', type: 'plant', x: 4.3, z: -3.3 }, { uid: 'p3', type: 'plant', x: 4.3, z: 3.3 }, { uid: 'p4', type: 'plant', x: -4.3, z: 3.3 }, { uid: 'p5', type: 'plant', x: 4.2, z: -1.6 },
      { uid: 'lp', type: 'floorLamp', x: 2.2, z: 3.3 }, { uid: 'ct', type: 'coffeeTable', x: .4, z: .9 },
      { uid: 'neon', type: 'neon', wall: 'back', u: -1.0, y: 3.6 }, DOOR(-2.2)
    ]
  },
  lab: {
    id: 'lab', no: '303', name: '深夜实验室', owner: '@byte',
    theme: { wall: '#181c33', trim: '#2a3052', floor: 'concrete', floorTint: '#3a3b44', neon: 'LAB 303', neonColor: '#9d8cff', sofa: '#2a2f52', bean: '#9d8cff', rug: ['#20244a', '#9d8cff', '#62e6ff', '#141733'] },
    items: [
      { uid: 'sr1', type: 'serverRack', x: -4.4, z: -3.4, entry: { kind: 'app', title: '自建推理集群面板', desc: '4 张显卡的实时负载与队列', url: '' } },
      { uid: 'sr2', type: 'serverRack', x: -3.35, z: -3.4 },
      { uid: 'desk', type: 'desk', x: 2.2, z: -3.25, rot: 0, opts: { console: false } },
      { uid: 'ch', type: 'chair', x: 2.2, z: -1.95, rot: 2, ry: -.3 },
      { uid: 'wb', type: 'whiteboard', x: -4.5, z: .2, rot: 1, entry: { kind: 'repo', title: 'RAG 管线', desc: '检索增强生成的最小实现，带评测脚本', url: '' } },
      { uid: 'k1', type: 'kiosk', x: -.8, z: .2, ry: .4, entry: { kind: 'web', title: '论文速读 Agent', desc: '贴一个论文链接，三分钟读懂', url: '' } },
      { uid: 'k2', type: 'kiosk', x: 1.6, z: .5, ry: -.3, entry: { kind: 'web', title: '日志可视化', desc: '把服务日志变成时间线', url: '' } },
      { uid: 'lp', type: 'floorLamp', x: -2.6, z: 3.3 }, { uid: 'bb', type: 'beanbag', x: 3.2, z: 2.6 },
      { uid: 'neon', type: 'neon', wall: 'back', u: -.6, y: 3.6 }, DOOR(1.2)
    ]
  }
};
const TEMPLATES = [
  { id: 'pixel', name: '像素工坊', desc: '街机、书架和瓷砖地', sw: ['#1b3442', '#62e6ff'] },
  { id: 'leaf', name: '植物温室', desc: '满屋绿植和暖光沙发', sw: ['#1f3a2c', '#7ee0a1'] },
  { id: 'lab', name: '深夜实验室', desc: '机柜、白板和水泥地', sw: ['#181c33', '#9d8cff'] },
  { id: 'empty', name: '毛坯房', desc: '只有门和霓虹，自己布置', sw: ['#2a2238', '#ffb454'] }
];
function residentInfo(r) {
  if (r.real) { const works = cleanItems((CLOUD.rooms.get(r.key) || {}).items).filter(i => i.entry && !['door', 'view', 'guestbook'].includes(i.entry.kind)).map(i => [i.entry.title, i.entry.kind]); return { no: r.no, handle: r.handle, name: r.name, tagline: r.tagline, tags: r.tags, works, state: 'open', real: true, mine: iOwnRoom(r.key), city: r.city }; }
  if (r.custom && CUSTOM[r.no]) { const c = CUSTOM[r.no]; return { no: r.no, handle: c.owner, name: c.name, tagline: '刚入住的新邻居', tags: ['新入住'], works: c.items.filter(i => i.entry && i.entry.kind !== 'door').map(i => [i.entry.title, i.entry.kind]), state: 'open', custom: true, mine: true, city: r.city }; }
  if (r.preset) {
    const p = ROOM_PRESETS[r.preset], works = [];
    p.items.forEach(i => { if (i.entry && i.entry.kind !== 'door') works.push([i.entry.title, i.entry.kind]); });
    if (r.preset === 'mine') { works.length = 0; works.push(['拾光', 'shiguang'], ['霓虹贪吃蛇', 'game'], ['酒保 Bit', 'agent'], ['留言黑板', 'guestbook']); }
    const m302 = r.preset === 'mine';
    return { no: r.no, handle: m302 ? (isMine302() ? '你' : ownerHandle302()) : p.owner, name: p.name, tagline: r.tagline, tags: r.tags || [], works, state: 'open', preset: r.preset, mine: m302 ? isMine302() : !!p.mine, city: r.city, demo: !m302 };
  }
  return Object.assign({ state: 'open', works: [], demo: !r.custom }, r);
}
function roomForResident(r) {
  if (r.real) { const room = realRoom(r); room.tz = tzFor(r.lat, r.lon); return room; }
  const info = residentInfo(r);
  let room;
  if (info.custom) room = clone(CUSTOM[r.no]);
  else if (info.preset) { room = info.preset === 'mine' ? loadRoom('mine') : clone(ROOM_PRESETS[info.preset]); if (info.preset === 'mine') { room.mine = isMine302(); room.owner = room.mine ? '你' : ownerHandle302(); } }
  else {
    const hue = r.hue || 0, wall = '#' + new THREE.Color().setHSL(hue, .32, .16).getHexString(), acc = '#' + new THREE.Color().setHSL(hue, .85, .66).getHexString();
    const rr2 = rng(hash(r.no));
    const items = [{ uid: 'rug', type: 'rug', x: .6, z: 1.2 }];
    const slots = [[-2.6, -2.7, .3], [0, -2.7, 0], [2.4, -2.7, -.3], [-2.4, .4, .4]];
    (r.works || []).forEach((w, i) => {
      const [x, z, ry] = slots[i], kind = w[1];
      items.push({ uid: 'w' + i, type: kind === 'game2' ? 'arcade' : (kind === 'repo' ? 'whiteboard' : 'kiosk'), x, z: kind === 'game2' ? -3.4 : z, ry: kind === 'game2' ? 0 : ry, entry: { kind, title: w[0], desc: '', url: '' } });
    });
    items.push({ uid: 'd1', type: 'plant', x: 4.3, z: 3.3 }, { uid: 'd2', type: rr2() > .5 ? 'sofa' : 'beanbag', x: .8, z: 2.7, rot: 2 }, { uid: 'd3', type: 'floorLamp', x: -4.3, z: -3.3 }, { uid: 'd4', type: 'bookshelf', x: -4.5, z: -.6, rot: 1 });
    items.push({ uid: 'neon', type: 'neon', wall: 'back', u: .2, y: 3.6 }, DOOR(-2.8));
    room = { id: 'r' + r.no, no: r.no, name: r.name, owner: r.handle, theme: { wall, trim: '#' + new THREE.Color().setHSL(hue, .3, .26).getHexString(), floor: rr2() > .5 ? 'wood' : 'tile', floorTint: '#' + new THREE.Color().setHSL(hue, .2, .3).getHexString(), neon: r.handle.replace('@', '').toUpperCase(), neonColor: acc, sofa: acc, bean: acc, rug: [wall, acc, '#ffb454', wall] }, items };
  }
  room.lat = r.lat; room.lon = r.lon; room.city = r.city; room.tz = tzFor(r.lat, r.lon);
  return room;
}
function loadRoom(id) {
  const p = clone(ROOM_PRESETS[id]);
  if (id === 'mine' && CLOUD.ready && CLOUD.site && Array.isArray(CLOUD.site.items) && CLOUD.site.items.length) { p.items = cleanItems(CLOUD.site.items, 'site/room302/works/'); return p; }
  const saved = p.mine && isMine302() ? store.get('gebi3.room.' + id, null) : null;
  if (saved && Array.isArray(saved) && saved.length) p.items = saved;
  return p;
}

