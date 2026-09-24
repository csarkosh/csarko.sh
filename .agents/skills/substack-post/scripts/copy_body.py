#!/usr/bin/env python3
"""Put a Substack post's body on the macOS clipboard as rich text.

    copy_body.py <folder>/post.md

Substack pastes Markdown as literal text, so links would arrive as "[text](url)". This
copies the paragraphs between the subtitle and the button as HTML, with working links,
plus a plain-text fallback. The title, subtitle, image and button are left out: they
go in Substack's own fields and blocks. macOS only (osascript).
"""

import html
import re
import subprocess
import sys
from pathlib import Path

LINK = re.compile(r"\[([^\]]+)\]\(([^)]+)\)")


def body_paragraphs(text):
    paras = text.strip().split("\n\n")[1:-1]  # drop the title/subtitle block and the button
    return [p.strip() for p in paras if not p.lstrip().startswith("![")]


def to_html(paragraph):
    # Escape the text and each URL exactly once; escaping the whole line first and the
    # URL again would turn every "&" in a UTM query into "&amp;amp;".
    out, last = [], 0
    for m in LINK.finditer(paragraph):
        out.append(html.escape(paragraph[last:m.start()], quote=False))
        out.append(f'<a href="{html.escape(m.group(2))}">{html.escape(m.group(1), quote=False)}</a>')
        last = m.end()
    out.append(html.escape(paragraph[last:], quote=False))
    return f"<p>{''.join(out)}</p>"


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__.strip())
    paras = body_paragraphs(Path(sys.argv[1]).read_text(encoding="utf-8"))
    doc = f'<html><head><meta charset="utf-8"></head><body>{"".join(map(to_html, paras))}</body></html>'
    plain = "\n\n".join(LINK.sub(r"\1", p) for p in paras).replace("\\", "\\\\").replace('"', '\\"')
    script = f'set the clipboard to {{«class HTML»:«data HTML{doc.encode("utf-8").hex().upper()}», string:"{plain}"}}'
    subprocess.run(["osascript", "-e", script], check=True)
    print(f"copied {len(paras)} paragraphs, {doc.count('<a ')} links, as rich text")


if __name__ == "__main__":
    main()
