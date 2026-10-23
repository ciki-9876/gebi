const $ = s => document.querySelector(s);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};
const clone = o => JSON.parse(JSON.stringify(o));
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const isNarrow = () => innerWidth <= 760;
function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const validUrl = u => /^https?:\/\/[^\s/$.?#][^\s]*\.[^\s]+$/i.test(String(u || '').trim());

const loaderMsg = $('#loaderMsg');
if (!window.THREE) { loaderMsg.textContent = '3D 引擎没有加载成功，请检查网络后刷新页面。'; return; }
const testGL = document.createElement('canvas');
if (!(testGL.getContext('webgl2') || testGL.getContext('webgl'))) { loaderMsg.textContent = '这个浏览器不支持 WebGL，无法显示 3D 房间。'; return; }

