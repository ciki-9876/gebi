/* ============================================================
   Geography: cities, residents, sun
   ============================================================ */
const D2R = Math.PI / 180, R2D = 180 / Math.PI;
function latLonToVec(lat, lon, r = 1, out) {
  const phi = (lon + 180) * D2R, th = (90 - lat) * D2R;
  return (out || new THREE.Vector3()).set(-Math.sin(th) * Math.cos(phi) * r, Math.cos(th) * r, Math.sin(th) * Math.sin(phi) * r);
}
function vecToLatLon(v) {
  const l = v.length(); const lat = Math.asin(clamp(v.y / l, -1, 1)) * R2D;
  let lon = Math.atan2(v.z, -v.x) * R2D - 180; while (lon < -180) lon += 360; while (lon > 180) lon -= 360;
  return { lat, lon };
}
function gcDist(a, b) { // km
  const p1 = a.lat * D2R, p2 = b.lat * D2R, dp = p2 - p1, dl = (b.lon - a.lon) * D2R;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}
function bearing(a, b) {
  const p1 = a.lat * D2R, p2 = b.lat * D2R, dl = (b.lon - a.lon) * D2R;
  return (Math.atan2(Math.sin(dl) * Math.cos(p2), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl)) * R2D + 360) % 360;
}
const DIRS = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];
function fmtCoord(lat, lon) { return `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'}  ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'}`; }

// [中文名, English, 国家/地区, lat, lon, UTC offset]
const CITIES = [
  ['上海', 'Shanghai', '中国', 31.2304, 121.4737, 8], ['北京', 'Beijing', '中国', 39.9042, 116.4074, 8], ['深圳', 'Shenzhen', '中国', 22.5431, 114.0579, 8],
  ['广州', 'Guangzhou', '中国', 23.1291, 113.2644, 8], ['杭州', 'Hangzhou', '中国', 30.2741, 120.1551, 8], ['成都', 'Chengdu', '中国', 30.5728, 104.0668, 8],
  ['重庆', 'Chongqing', '中国', 29.563, 106.5516, 8], ['武汉', 'Wuhan', '中国', 30.5928, 114.3055, 8], ['西安', "Xi'an", '中国', 34.3416, 108.9398, 8],
  ['南京', 'Nanjing', '中国', 32.0603, 118.7969, 8], ['苏州', 'Suzhou', '中国', 31.2989, 120.5853, 8], ['厦门', 'Xiamen', '中国', 24.4798, 118.0894, 8],
  ['长沙', 'Changsha', '中国', 28.2282, 112.9388, 8], ['青岛', 'Qingdao', '中国', 36.0671, 120.3826, 8], ['大连', 'Dalian', '中国', 38.914, 121.6147, 8],
  ['哈尔滨', 'Harbin', '中国', 45.8038, 126.535, 8], ['昆明', 'Kunming', '中国', 25.0389, 102.7183, 8], ['拉萨', 'Lhasa', '中国', 29.652, 91.1721, 8],
  ['乌鲁木齐', 'Urumqi', '中国', 43.8256, 87.6168, 8], ['香港', 'Hong Kong', '中国香港', 22.3193, 114.1694, 8], ['澳门', 'Macau', '中国澳门', 22.1987, 113.5439, 8],
  ['台北', 'Taipei', '中国台湾', 25.033, 121.5654, 8], ['东京', 'Tokyo', '日本', 35.6762, 139.6503, 9], ['大阪', 'Osaka', '日本', 34.6937, 135.5023, 9],
  ['京都', 'Kyoto', '日本', 35.0116, 135.7681, 9], ['札幌', 'Sapporo', '日本', 43.0618, 141.3545, 9], ['福冈', 'Fukuoka', '日本', 33.5902, 130.4017, 9],
  ['首尔', 'Seoul', '韩国', 37.5665, 126.978, 9], ['釜山', 'Busan', '韩国', 35.1796, 129.0756, 9], ['乌兰巴托', 'Ulaanbaatar', '蒙古', 47.8864, 106.9057, 8],
  ['新加坡', 'Singapore', '新加坡', 1.3521, 103.8198, 8], ['吉隆坡', 'Kuala Lumpur', '马来西亚', 3.139, 101.6869, 8], ['曼谷', 'Bangkok', '泰国', 13.7563, 100.5018, 7],
  ['清迈', 'Chiang Mai', '泰国', 18.7883, 98.9853, 7], ['河内', 'Hanoi', '越南', 21.0278, 105.8342, 7], ['胡志明市', 'Ho Chi Minh City', '越南', 10.8231, 106.6297, 7],
  ['马尼拉', 'Manila', '菲律宾', 14.5995, 120.9842, 8], ['雅加达', 'Jakarta', '印度尼西亚', -6.2088, 106.8456, 7], ['巴厘岛', 'Bali', '印度尼西亚', -8.3405, 115.092, 8],
  ['孟买', 'Mumbai', '印度', 19.076, 72.8777, 5.5], ['新德里', 'New Delhi', '印度', 28.6139, 77.209, 5.5], ['班加罗尔', 'Bengaluru', '印度', 12.9716, 77.5946, 5.5],
  ['加德满都', 'Kathmandu', '尼泊尔', 27.7172, 85.324, 5.75], ['科伦坡', 'Colombo', '斯里兰卡', 6.9271, 79.8612, 5.5], ['达卡', 'Dhaka', '孟加拉国', 23.8103, 90.4125, 6],
  ['迪拜', 'Dubai', '阿联酋', 25.2048, 55.2708, 4], ['多哈', 'Doha', '卡塔尔', 25.2854, 51.531, 3], ['利雅得', 'Riyadh', '沙特阿拉伯', 24.7136, 46.6753, 3],
  ['德黑兰', 'Tehran', '伊朗', 35.6892, 51.389, 3.5], ['伊斯坦布尔', 'Istanbul', '土耳其', 41.0082, 28.9784, 3], ['特拉维夫', 'Tel Aviv', '以色列', 32.0853, 34.7818, 2],
  ['开罗', 'Cairo', '埃及', 30.0444, 31.2357, 2], ['莫斯科', 'Moscow', '俄罗斯', 55.7558, 37.6173, 3], ['圣彼得堡', 'Saint Petersburg', '俄罗斯', 59.9311, 30.3609, 3],
  ['新西伯利亚', 'Novosibirsk', '俄罗斯', 55.0084, 82.9357, 7], ['海参崴', 'Vladivostok', '俄罗斯', 43.1198, 131.8869, 10], ['伦敦', 'London', '英国', 51.5074, -.1278, 0],
  ['爱丁堡', 'Edinburgh', '英国', 55.9533, -3.1883, 0], ['都柏林', 'Dublin', '爱尔兰', 53.3498, -6.2603, 0], ['巴黎', 'Paris', '法国', 48.8566, 2.3522, 1],
  ['里昂', 'Lyon', '法国', 45.764, 4.8357, 1], ['柏林', 'Berlin', '德国', 52.52, 13.405, 1], ['慕尼黑', 'Munich', '德国', 48.1351, 11.582, 1],
  ['阿姆斯特丹', 'Amsterdam', '荷兰', 52.3676, 4.9041, 1], ['布鲁塞尔', 'Brussels', '比利时', 50.8503, 4.3517, 1], ['苏黎世', 'Zurich', '瑞士', 47.3769, 8.5417, 1],
  ['维也纳', 'Vienna', '奥地利', 48.2082, 16.3738, 1], ['布拉格', 'Prague', '捷克', 50.0755, 14.4378, 1], ['华沙', 'Warsaw', '波兰', 52.2297, 21.0122, 1],
  ['哥本哈根', 'Copenhagen', '丹麦', 55.6761, 12.5683, 1], ['斯德哥尔摩', 'Stockholm', '瑞典', 59.3293, 18.0686, 1], ['奥斯陆', 'Oslo', '挪威', 59.9139, 10.7522, 1],
  ['赫尔辛基', 'Helsinki', '芬兰', 60.1699, 24.9384, 2], ['特罗姆瑟', 'Tromsø', '挪威', 69.6492, 18.9553, 1], ['雷克雅未克', 'Reykjavik', '冰岛', 64.1466, -21.9426, 0],
  ['马德里', 'Madrid', '西班牙', 40.4168, -3.7038, 1], ['巴塞罗那', 'Barcelona', '西班牙', 41.3874, 2.1686, 1], ['里斯本', 'Lisbon', '葡萄牙', 38.7223, -9.1393, 0],
  ['罗马', 'Rome', '意大利', 41.9028, 12.4964, 1], ['米兰', 'Milan', '意大利', 45.4642, 9.19, 1], ['雅典', 'Athens', '希腊', 37.9838, 23.7275, 2],
  ['基辅', 'Kyiv', '乌克兰', 50.4501, 30.5234, 2], ['拉各斯', 'Lagos', '尼日利亚', 6.5244, 3.3792, 1], ['内罗毕', 'Nairobi', '肯尼亚', -1.2921, 36.8219, 3],
  ['亚的斯亚贝巴', 'Addis Ababa', '埃塞俄比亚', 8.9806, 38.7578, 3], ['开普敦', 'Cape Town', '南非', -33.9249, 18.4241, 2], ['约翰内斯堡', 'Johannesburg', '南非', -26.2041, 28.0473, 2],
  ['卡萨布兰卡', 'Casablanca', '摩洛哥', 33.5731, -7.5898, 1], ['阿克拉', 'Accra', '加纳', 5.6037, -.187, 0], ['纽约', 'New York', '美国', 40.7128, -74.006, -5],
  ['波士顿', 'Boston', '美国', 42.3601, -71.0589, -5], ['华盛顿', 'Washington', '美国', 38.9072, -77.0369, -5], ['芝加哥', 'Chicago', '美国', 41.8781, -87.6298, -6],
  ['奥斯汀', 'Austin', '美国', 30.2672, -97.7431, -6], ['丹佛', 'Denver', '美国', 39.7392, -104.9903, -7], ['西雅图', 'Seattle', '美国', 47.6062, -122.3321, -8],
  ['旧金山', 'San Francisco', '美国', 37.7749, -122.4194, -8], ['洛杉矶', 'Los Angeles', '美国', 34.0522, -118.2437, -8], ['迈阿密', 'Miami', '美国', 25.7617, -80.1918, -5],
  ['檀香山', 'Honolulu', '美国', 21.3069, -157.8583, -10], ['安克雷奇', 'Anchorage', '美国', 61.2181, -149.9003, -9], ['温哥华', 'Vancouver', '加拿大', 49.2827, -123.1207, -8],
  ['多伦多', 'Toronto', '加拿大', 43.6532, -79.3832, -5], ['蒙特利尔', 'Montreal', '加拿大', 45.5017, -73.5673, -5], ['墨西哥城', 'Mexico City', '墨西哥', 19.4326, -99.1332, -6],
  ['哈瓦那', 'Havana', '古巴', 23.1136, -82.3666, -5], ['波哥大', 'Bogotá', '哥伦比亚', 4.711, -74.0721, -5], ['利马', 'Lima', '秘鲁', -12.0464, -77.0428, -5],
  ['圣地亚哥', 'Santiago', '智利', -33.4489, -70.6693, -3], ['布宜诺斯艾利斯', 'Buenos Aires', '阿根廷', -34.6037, -58.3816, -3], ['圣保罗', 'São Paulo', '巴西', -23.5505, -46.6333, -3],
  ['里约热内卢', 'Rio de Janeiro', '巴西', -22.9068, -43.1729, -3], ['马瑙斯', 'Manaus', '巴西', -3.119, -60.0217, -4], ['悉尼', 'Sydney', '澳大利亚', -33.8688, 151.2093, 11],
  ['墨尔本', 'Melbourne', '澳大利亚', -37.8136, 144.9631, 11], ['珀斯', 'Perth', '澳大利亚', -31.9505, 115.8605, 8], ['布里斯班', 'Brisbane', '澳大利亚', -27.4698, 153.0251, 10],
  ['达尔文', 'Darwin', '澳大利亚', -12.4634, 130.8456, 9.5], ['奥克兰', 'Auckland', '新西兰', -36.8485, 174.7633, 13], ['皇后镇', 'Queenstown', '新西兰', -45.0312, 168.6626, 13]
].map(c => ({ zh: c[0], en: c[1], country: c[2], lat: c[3], lon: c[4], tz: c[5] }));
function nearestCity(p) { let best = null, bd = 1e9; for (const c of CITIES) { const d = gcDist(p, c); if (d < bd) { bd = d; best = c; } } return { city: best, km: bd }; }
function oceanName(lat, lon) {
  if (lat < -58) return '南大洋'; if (lat > 68) return '北冰洋';
  if (lon > -72 && lon < 22 && lat > -58) return '大西洋';
  if (lon >= 22 && lon < 125 && lat < 25) return '印度洋';
  return '太平洋';
}
function describePlace(lat, lon, water) {
  const p = { lat, lon }, n = nearestCity(p), c = n.city, km = n.km;
  if (water && km > 120) return { title: oceanName(lat, lon), sub: `离最近的${c.zh}约 ${Math.round(km / 10) * 10} 公里`, city: c, km, water: true };
  if (km < 45) return { title: c.zh, sub: `${c.country} · ${c.en}`, city: c, km };
  if (km < 320) return { title: `${c.zh}附近`, sub: `${c.country} · 距市中心 ${Math.round(km)} 公里`, city: c, km };
  const dir = DIRS[Math.round(bearing(c, p) / 45) % 8];
  return { title: `${c.zh}以${dir}`, sub: `${c.country}方向 · 约 ${Math.round(km / 10) * 10} 公里`, city: c, km };
}
const CITY_ZONE = { 伦敦: 'Europe/London', 爱丁堡: 'Europe/London', 都柏林: 'Europe/Dublin', 巴黎: 'Europe/Paris', 里昂: 'Europe/Paris', 柏林: 'Europe/Berlin', 慕尼黑: 'Europe/Berlin', 阿姆斯特丹: 'Europe/Amsterdam', 布鲁塞尔: 'Europe/Brussels', 苏黎世: 'Europe/Zurich', 维也纳: 'Europe/Vienna', 布拉格: 'Europe/Prague', 华沙: 'Europe/Warsaw', 哥本哈根: 'Europe/Copenhagen', 斯德哥尔摩: 'Europe/Stockholm', 奥斯陆: 'Europe/Oslo', 赫尔辛基: 'Europe/Helsinki', 特罗姆瑟: 'Europe/Oslo', 马德里: 'Europe/Madrid', 巴塞罗那: 'Europe/Madrid', 里斯本: 'Europe/Lisbon', 罗马: 'Europe/Rome', 米兰: 'Europe/Rome', 雅典: 'Europe/Athens', 基辅: 'Europe/Kiev', 特拉维夫: 'Asia/Jerusalem', 开罗: 'Africa/Cairo', 卡萨布兰卡: 'Africa/Casablanca', 纽约: 'America/New_York', 波士顿: 'America/New_York', 华盛顿: 'America/New_York', 迈阿密: 'America/New_York', 芝加哥: 'America/Chicago', 奥斯汀: 'America/Chicago', 丹佛: 'America/Denver', 西雅图: 'America/Los_Angeles', 旧金山: 'America/Los_Angeles', 洛杉矶: 'America/Los_Angeles', 安克雷奇: 'America/Anchorage', 温哥华: 'America/Vancouver', 多伦多: 'America/Toronto', 蒙特利尔: 'America/Toronto', 哈瓦那: 'America/Havana', 圣地亚哥: 'America/Santiago', 悉尼: 'Australia/Sydney', 墨尔本: 'Australia/Melbourne', 奥克兰: 'Pacific/Auckland', 皇后镇: 'Pacific/Auckland' };
function zoneOffset(zone, d = new Date()) {
  try {
    const p = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }).formatToParts(d);
    const g = t => +p.find(x => x.type === t).value;
    return Math.round((Date.UTC(g('year'), g('month') - 1, g('day'), g('hour') % 24, g('minute')) - d.getTime()) / 9e5) / 4;
  } catch (e) { return null; }
}
function tzFor(lat, lon) {
  const n = nearestCity({ lat, lon }); if (n.km >= 900) return Math.round(lon / 15);
  const z = CITY_ZONE[n.city.zh], off = z ? zoneOffset(z) : null;
  return off == null ? n.city.tz : off;
}
function sunInfo(date = new Date()) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0), N = (date - start) / 864e5;
  const decl = -23.44 * Math.cos(2 * Math.PI / 365 * (N + 10));
  const utcH = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  let lon = -(utcH - 12) * 15; while (lon < -180) lon += 360; while (lon > 180) lon -= 360;
  return { decl, lon, utcH };
}
function localSky(lat, lon, tz, date = new Date()) {
  const s = sunInfo(date), H = (s.utcH + lon / 15 - 12) * 15 * D2R;
  const alt = Math.asin(Math.sin(lat * D2R) * Math.sin(s.decl * D2R) + Math.cos(lat * D2R) * Math.cos(s.decl * D2R) * Math.cos(H)) * R2D;
  const lh = ((s.utcH + (tz == null ? Math.round(lon / 15) : tz)) % 24 + 24) % 24;
  const time = `${String(Math.floor(lh)).padStart(2, '0')}:${String(Math.floor((lh % 1) * 60)).padStart(2, '0')}`;
  const phase = alt > 10 ? 'day' : alt > -1 ? 'golden' : alt > -10 ? 'dusk' : 'night';
  const label = { day: '白天', golden: lh < 12 ? '清晨' : '傍晚', dusk: lh < 12 ? '黎明' : '入夜', night: '夜里' }[phase];
  return { alt, phase, time, label, morning: lh < 12 };
}

/* Residents live at real addresses. 演示数据 except the visitor's own room. */
const ME = store.get('gebi3.me', null) || { lat: 31.2304, lon: 121.4737, city: '上海' };
const RESIDENTS = [
  { no: '302', preset: 'mine', handle: '你', lat: ME.lat, lon: ME.lon, city: ME.city, tagline: '电竞房加一个小酒吧', tags: ['电竞', '酒吧', 'AI 助手'], friends: ['204', '101', '303', '203'] },
  { no: '204', preset: 'pixel', city: '东京', lat: 35.6595, lon: 139.7005, tagline: '复古像素小游戏合集', tags: ['独立游戏', '像素'], friends: ['102', '304'] },
  { no: '101', preset: 'leaf', city: '成都', lat: 30.6598, lon: 104.0633, tagline: '代码和植物都需要浇水', tags: ['生活工具', '开源'], friends: ['203'] },
  { no: '303', preset: 'lab', city: '柏林', lat: 52.4996, lon: 13.4180, tagline: '凌晨三点的推理集群', tags: ['AI', '数据'], friends: ['104', '202', '301'] },
  { no: '301', handle: '@ottomo', name: '打字机书房', city: '巴黎', lat: 48.8530, lon: 2.3499, tagline: '把每个小工具都写成一封信', tags: ['工具', '写作'], works: [['Markdown 信纸', 'app'], ['每日一句', 'web']], hue: .08 },
  { no: '202', handle: '@sora', name: '云朵气象站', city: '雷克雅未克', lat: 64.1466, lon: -21.9426, tagline: '天气数据加上生成音乐', tags: ['可视化', '音频'], works: [['会唱歌的天气', 'web'], ['风向竖琴', 'game2']], hue: .55 },
  { no: '102', handle: '@nova', name: '星图咖啡', city: '旧金山', lat: 37.7599, lon: -122.4148, tagline: '一杯咖啡一个星座', tags: ['WebGL', '趣味'], works: [['星座连连看', 'game2'], ['咖啡因计算器', 'app']], hue: .72, friends: ['105'] },
  { no: '104', handle: '@kumo', name: '模型火车站', city: '伦敦', lat: 51.5226, lon: -.0802, tagline: '调度算法的可视化铁路', tags: ['算法', '可视化'], works: [['A* 调度台', 'web'], ['时刻表生成器', 'app'], ['铁路大亨 mini', 'game2']], hue: .12 },
  { no: '105', handle: '@rio', name: '地铁像素站', city: '纽约', lat: 40.7265, lon: -73.9815, tagline: '把通勤做成小游戏', tags: ['游戏', '城市'], works: [['线路图生成器', 'web'], ['早高峰', 'game2']], hue: .6, friends: ['107'] },
  { no: '106', handle: '@ari', name: '浪花合成器', city: '悉尼', lat: -33.8915, lon: 151.2767, tagline: '海浪声做成的乐器', tags: ['音频', '生成艺术'], works: [['冲浪节拍机', 'web'], ['潮汐时钟', 'app']], hue: .5, friends: ['204'] },
  { no: '107', handle: '@duda', name: '桑巴音序器', city: '圣保罗', lat: -23.5613, lon: -46.6565, tagline: '狂欢节节奏工坊', tags: ['音乐', '游戏'], works: [['鼓点编辑器', 'app'], ['狂欢节跑酷', 'game2']], hue: .9 },
  { no: '108', handle: '@dev', name: '香料实验室', city: '班加罗尔', lat: 12.9352, lon: 77.6245, tagline: '咖喱配方 Agent 与菜谱生成器', tags: ['AI', '美食'], works: [['咖喱配方 Agent', 'web'], ['香料轮盘', 'game2']], hue: .07, friends: ['302'] },
  { no: '304', handle: '@mira', name: '字体铺', city: '首尔', lat: 37.5563, lon: 126.9236, tagline: '正在搬进来，预计本周开张', state: 'reno', hue: .95 },
  { no: '203', handle: '@han', name: '竖排排版社', city: '台北', lat: 25.0418, lon: 121.5654, tagline: '中文竖排工具箱，装修中', state: 'reno', hue: .02 },
  { no: '109', handle: '@kofi', name: '鼓语电台', city: '阿克拉', lat: 5.6037, lon: -.187, tagline: '西非鼓点的节奏教学', tags: ['音乐', '教育'], works: [['节奏跟拍', 'game2']], hue: .1 },
  { no: '110', handle: '@lumi', name: '极光暗房', city: '特罗姆瑟', lat: 69.6492, lon: 18.9553, tagline: '用着色器冲洗极光照片', tags: ['图形学', '摄影'], works: [['极光着色器', 'web'], ['长曝光模拟器', 'app']], hue: .4, friends: ['202'] }
];
const CUSTOM = store.get('gebi3.custom', {});   // rooms the visitor created at new addresses
Object.values(CUSTOM).forEach(r => { if (!RESIDENTS.some(x => x.no === r.no)) RESIDENTS.push({ no: r.no, custom: true, handle: r.owner, name: r.name, city: r.city, lat: r.lat, lon: r.lon, tagline: '刚入住的新邻居', tags: ['新入住'] }); });

const today = new Date();
const DATE_STR = `${today.getMonth() + 1}月${today.getDate()}日 周${'日一二三四五六'[today.getDay()]}`;

/* ---------- 拾光 state ---------- */
const SKINS = {
  light: { name: '轻', bg: '#f6f4ee', ink: '#2a2a2e', mute: '#9a96a0', acc: '#4b7bec', frame: '#efe9de', line: '#e3ddd1' },
  capsule: { name: '扭蛋', bg: '#ffe3ec', ink: '#5a2440', mute: '#c07a98', acc: '#ff6fa0', frame: '#ff9fc1', line: '#ffb7cf' },
  key: { name: '键', bg: '#24262c', ink: '#efe7d6', mute: '#8b8778', acc: '#ffb454', frame: '#3a3d45', line: '#17181c' }
};
const SG = store.get('gebi.shiguang', null) || {
  skin: 'light',
  tasks: [
    { t: '给拾光的托盘菜单补上暗色样式', done: true },
    { t: '回复 @pixelmo 在黑板上的留言', done: false },
    { t: '录一段 30 秒的演示视频', done: false },
    { t: '整理 Bit 的知识卡片', done: true },
    { t: '周五前把扩展提交到 Edge 商店', done: false }
  ]
};
const saveSG = () => store.set('gebi.shiguang', SG);

/* ---------- guestbook ---------- */
const GB_EXAMPLES = [
  { name: '@pixelmo', text: '贪吃蛇打到 37 分，下次来挑战你的纪录', time: '昨天', ex: true },
  { name: '@leafcode', text: 'Bit 调的“零点特调”是什么味道？求配方', time: '昨天', ex: true },
  { name: '@byte', text: '洞洞板上的拾光便签好可爱，键盘主题能出同款吗', time: '2 天前', ex: true }
];
const GB = store.get('gebi.guestbook', []);

