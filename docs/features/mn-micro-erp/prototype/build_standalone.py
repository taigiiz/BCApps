#!/usr/bin/env python3
"""Build prototype/standalone.html: one self-contained file for opening locally.

Reads app.html (page content only), inlines every local stylesheet (<link rel="stylesheet" href="…css">) and every
local script (<script src="…js">) in the same order, keeps the Google Fonts links, and wraps the result in a full
<!doctype html> document. Run:  python3 docs/features/mn-micro-erp/prototype/build_standalone.py
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, 'app.html')
OUT = os.path.join(ROOT, 'standalone.html')


def read(rel):
    with open(os.path.join(ROOT, rel), encoding='utf-8') as f:
        return f.read()


def main():
    page = read('app.html')
    title = re.search(r'<title>.*?</title>', page, re.S).group(0)
    head_links = re.findall(r'<link rel="preconnect"[^>]*>|<link rel="stylesheet" href="https://fonts\.googleapis\.com[^"]*"[^>]*>', page)
    css_files = re.findall(r'<link rel="stylesheet" href="((?!https?:)[^"]+\.css)">', page)
    js_files = re.findall(r'<script src="([^"]+)"></script>', page)

    body = page
    body = body.replace(title, '')
    for l in head_links:
        body = body.replace(l, '')
    body = re.sub(r'<link rel="stylesheet" href="(?!https?:)[^"]+\.css">\s*', '', body)
    body = re.sub(r'<script src="[^"]+"></script>\s*', '', body).strip()

    styles = '\n'.join('/* ===== %s ===== */\n%s' % (f, read(f)) for f in css_files)
    scripts = '\n'.join('<script>/* ===== %s ===== */\n%s\n</script>' % (f, read(f).replace('</script', '<\\/script')) for f in js_files)

    out = (
        '<!doctype html>\n<html lang="mn">\n<head>\n'
        '<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
        + title + '\n' + '\n'.join(head_links) + '\n'
        '<style>\n' + styles + '\n</style>\n</head>\n<body>\n'
        + body + '\n' + scripts + '\n</body>\n</html>\n'
    )
    with open(OUT, 'w', encoding='utf-8') as f:
        f.write(out)
    print('wrote %s (%d bytes; %d stylesheets, %d scripts inlined)' % (os.path.relpath(OUT), len(out.encode('utf-8')), len(css_files), len(js_files)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
