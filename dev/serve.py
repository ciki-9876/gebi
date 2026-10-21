"""本地预览。

python3 dev/serve.py            # 单机模式：数据存在浏览器本地
python3 dev/serve.py --mock     # 多人模式：用 dev/mock-claude.js 模拟 claude.ai 的 db 与 user 能力

多人模式下，用 URL 参数切换身份，例如：
  http://127.0.0.1:8765/preview.html?uid=u_owner&owner=1   房主
  http://127.0.0.1:8765/preview.html?uid=u_guest&owner=0   参与者
  http://127.0.0.1:8765/preview.html?uid=u_view&owner=0&ro=1  只读参观者
同一浏览器里的多个标签页共享模拟数据库（localStorage）。
"""
import http.server, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
page = open('index.html', encoding='utf-8').read()
if '--mock' in sys.argv:
    page = page.replace('<script src="app.js"></script>', '<script src="dev/mock-claude.js"></script><script src="app.js"></script>')
head = ('<!doctype html><html><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
        '<style>:root{color-scheme:light}body{margin:0;font:14px system-ui}[hidden]{display:none!important}</style>'
        '</head><body>')
open('preview.html', 'w', encoding='utf-8').write(head + page + '</body></html>')
port = 8765
print(f'http://127.0.0.1:{port}/preview.html')
http.server.ThreadingHTTPServer(('127.0.0.1', port), http.server.SimpleHTTPRequestHandler).serve_forever()
