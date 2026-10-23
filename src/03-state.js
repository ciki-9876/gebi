/* ============================================================
   State
   ============================================================ */
const S = {
  view: 'globe', mode: 'visit', room: null, roomRoot: null, resident: null,
  itemGroups: new Map(), dyn: null, hover: null, focus: null, selected: null, panel: null,
  mood: 'chill', sample: null, sampleTools: false,
  chat: { log: [], turns: [], busy: false, ctl: null },
  hotspots: [], grid: null, selRing: null, liked: store.get('gebi.liked', {}),
  colliders: [], wallGroups: null, ceiling: null, busy: false
};

