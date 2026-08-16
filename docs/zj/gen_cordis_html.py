"""Generate cordis-subsystem.html from cordis-subsystem.md.

数据源是同目录的 cordis-subsystem.md；本脚本把 md 内联进 HTML，
用 marked + mermaid（cdnjs）在浏览器端渲染。改 md 后重跑本脚本同步 HTML。

用法:
  python gen_cordis_html.py
"""

from __future__ import annotations

import datetime as _dt
from pathlib import Path

HERE = Path(__file__).resolve().parent
MD_FILE = HERE / "cordis-subsystem.md"
OUT_FILE = HERE / "cordis-subsystem.html"

TEMPLATE = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Cordis 子系统（C4）</title>
<style>
:root { color-scheme: light dark; }
body {
  font-family: -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  max-width: 980px; margin: 0 auto; padding: 24px 20px 80px;
  line-height: 1.65; font-size: 15px;
}
h1 { font-size: 1.6em; border-bottom: 2px solid #8884; padding-bottom: 8px; }
h2 { font-size: 1.3em; margin-top: 2.2em; border-bottom: 1px solid #8883; padding-bottom: 6px; }
h3 { font-size: 1.1em; margin-top: 1.6em; }
h4 { font-size: 1em; margin-top: 1.3em; color: #555; }
table { border-collapse: collapse; width: 100%; margin: 12px 0; }
th, td { border: 1px solid #8883; padding: 6px 10px; text-align: left; vertical-align: top; }
th { background: #8881a; }
code { font-family: Consolas, Menlo, monospace; font-size: 0.9em;
  background: #8882; border-radius: 4px; padding: 1px 5px; }
pre { background: #8881; border-radius: 8px; padding: 12px 14px; overflow-x: auto; }
pre code { background: none; padding: 0; }
blockquote { border-left: 4px solid #8886; margin: 12px 0; padding: 4px 16px; color: #888; }
.mermaid { display: flex; justify-content: center; margin: 16px 0; text-align: center; }
footer { margin-top: 60px; color: #888; font-size: 13px; border-top: 1px solid #8883; padding-top: 12px; }
</style>
<script src="https://cdnjs.cloudflare.com/ajax/libs/marked/12.0.2/marked.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/mermaid/10.9.1/mermaid.min.js"></script>
</head>
<body>
<div id="content">正在渲染…（需要网络加载 marked/mermaid）</div>
<footer>数据源：cordis-subsystem.md（勿手改本 HTML）· 生成于 __TIMESTAMP__</footer>
<script id="source" type="text/markdown">__CONTENT__</script>
<script>
const src = document.getElementById('source').textContent;
const html = marked.parse(src, { gfm: true, breaks: false });
const box = document.getElementById('content');
box.innerHTML = html;
mermaid.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'loose' });
const blocks = box.querySelectorAll('pre code.language-mermaid');
for (const b of blocks) {
  const div = document.createElement('div');
  div.className = 'mermaid';
  div.textContent = b.textContent;
  b.closest('pre').replaceWith(div);
}
mermaid.run({ querySelector: '.mermaid' });
</script>
</body>
</html>
"""


def main() -> None:
    md = MD_FILE.read_text(encoding="utf-8")
    stamp = _dt.datetime.now().strftime("%Y-%m-%d %H:%M")
    html = TEMPLATE.replace("__CONTENT__", md).replace("__TIMESTAMP__", stamp)
    OUT_FILE.write_text(html, encoding="utf-8")
    print(f"written: {OUT_FILE}")


if __name__ == "__main__":
    main()
