#!/usr/bin/env python3
"""Version local CSS/JS references in assembled static Pages output.

Runs independently for LIVE root and DEV subpath. Only local relative asset
URLs are rewritten; no remote URLs, absolute paths or token values are touched.
"""
import hashlib
import html
from pathlib import Path
import re
import sys
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

TAG = re.compile(r'<(?:script|link)\b[^>]*>', re.I)
ATTR = re.compile(r'\b(?:src|href)\s*=\s*(["\'])(.*?)\1', re.I | re.S)


def version_url(url: str, document: Path, root: Path) -> str:
    parts = urlsplit(html.unescape(url))
    if parts.scheme or parts.netloc or parts.path.startswith('/') or not parts.path.lower().endswith(('.js', '.css')):
        return url
    asset = (document.parent / parts.path).resolve()
    if not asset.is_relative_to(root.resolve()) or not asset.is_file():
        return url
    digest = hashlib.sha256(asset.read_bytes()).hexdigest()[:16]
    query = [(key, value) for key, value in parse_qsl(parts.query, keep_blank_values=True) if key != 'v']
    query.append(('v', digest))
    result = urlunsplit(('', '', parts.path, urlencode(query), parts.fragment))
    return html.escape(result, quote=True).replace('&#x27;', '&#39;')


def rewrite(document: Path, root: Path) -> bool:
    original = document.read_text(encoding='utf-8')
    def tag_replacement(match):
        tag = match.group(0)
        return ATTR.sub(lambda attr: attr.group(0).replace(attr.group(2), version_url(attr.group(2), document, root), 1), tag)
    changed = TAG.sub(tag_replacement, original)
    if changed != original:
        document.write_text(changed, encoding='utf-8')
    return changed != original


def main():
    if len(sys.argv) != 2:
        raise SystemExit('Usage: version-pages-assets.py <assembled-site-root>')
    site = Path(sys.argv[1]).resolve()
    if not site.is_dir():
        raise SystemExit('Site directory not found')
    count = 0
    for root in (site, site / 'dev'):
        if not root.is_dir():
            continue
        for page in root.rglob('*.html'):
            if root == site and (site / 'dev') in page.parents:
                continue
            count += rewrite(page, root)
    print(f'Content-versioned HTML documents: {count}')


if __name__ == '__main__':
    main()
