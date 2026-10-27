#!/usr/bin/env node
// 粘贴文本识别（src/22-art-types.js 的 sniffText）的回归测试：node tools/test-sniff.mjs
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src/22-art-types.js'), 'utf8');
const body = src.slice(src.indexOf('const CODE_STRONG'), src.indexOf('function isJsonText'));
const sniffText = vm.runInNewContext(body + '\nsniffText;');
let failed = 0;
const eq = (text, want, msg) => { const got = sniffText(text); console.log((got === want ? '通过  ' : `失败  （得到 ${got}）`) + msg); if (got !== want) failed++; };

// 代码
eq('def add(a, b):\n    return a + b\n\nprint(add(1, 2))\nx = add(3, 4)', 'data', '四行 Python 是代码');
eq('const a = 1;\nconsole.log(a);', 'data', '短 JavaScript 是代码');
eq('function f() {\n  return 1;\n}', 'data', '带花括号的函数是代码');
eq('if (x) {\n  y();\n} else {\n  z();\n}', 'data', 'if/else 块是代码');
eq('{"a": 1, "b": [1, 2]}', 'data', 'JSON 是数据');
eq('int count;\nint value;', 'data', '两行 C 声明是代码（#12 复审指出）');
eq('unsigned long n;\nstatic const char *name;', 'data', '带修饰词的 C 声明是代码');
eq('break;\ncontinue;', 'data', 'break; continue; 是代码（#12 复审指出）');
eq('i++;\nusing namespace std;', 'data', 'i++; 和 using 语句是代码');
eq('DROP TABLE users;', 'data', '没有代码符号的 SQL 语句是代码');
// 文档
eq('今天去了公园，天气很好。\n晚上吃了火锅。', 'doc', '普通中文是文档');
eq('# 标题\n\n- 第一项\n- 第二项\n\n正文。', 'doc', 'Markdown 是文档');
eq('# 操作说明\n第一步：安装依赖;\n第二步：启动服务;', 'doc', '带分号的中文说明不是代码（#12 评审指出）');
eq('# Meeting notes\nDiscuss the timeline;\nConfirm the budget;', 'doc', '带分号的英文会议记录不是代码');
eq('- apples;\n- pears;', 'doc', '以分号结尾的列表不是代码');
eq('Discuss the timeline;\nConfirm the budget;', 'doc', '没有标题、带分号的英文句子不是代码');
eq('第一步：安装依赖;\n第二步：启动服务;', 'doc', '没有标题、带分号的中文说明不是代码');
// 网页
eq('<!doctype html><html><body>hi</body></html>', 'web', 'HTML 是网页');
eq('<canvas id=c></canvas><script>addEventListener("keydown",()=>{});requestAnimationFrame(f)</script>', 'game', 'canvas 加按键是小游戏');

console.log(failed ? `\n${failed} 项失败` : '\n全部通过');
process.exit(failed ? 1 : 0);
