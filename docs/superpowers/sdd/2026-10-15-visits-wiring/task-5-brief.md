### Task 5: `check.py`'s analytics checks

**Files:**
- Modify: `.agents/skills/site-quality/scripts/check.py:40-51` (config and `THIRD_PARTY`), `:955-1001` (`analytics_checks`), `:994-996`

**Interfaces:**
- Consumes: `site.json` as above; `strip_comments` at `check.py:949`.

- [ ] **Step 1: Config and allowlist**

Replace lines 40-51 so that `ANALYTICS` is the config (`{"endpoint": "/v"}` or `None`) and `THIRD_PARTY = {"script-src": [], "connect-src": [], "img-src": []}` (no origins: the beacon is same-origin). Keep the variable names the rest of the file reads (`THIRD_PARTY`, used at 494-497 and 660-662).

- [ ] **Step 2: Rewrite `analytics_checks(pages)`**

```python
def analytics_checks(pages):
    """Every page carries the two lib-visits tags, with the vendored files' hashes, and nothing else."""
    if not ANALYTICS:
        for page in pages:
            check("data-visits" not in page.html, f"{page.name}: analytics is off but a visits tag is present")
        return
    def want(stem):
        data = strip_comments((SKILL / f"assets/vendor/{stem}.min.js").read_bytes())
        return f"{stem}.{hashlib.sha256(data).hexdigest()[:8]}.js"
    want_core, want_vitals = want("visits"), want("vitals")
    for page in pages:
        prefix = "" if page.path.name == "index.html" and page.path.parent == PUBLIC else "/"
        scripts = re.findall(r"<script\b([^>]*)>", page.html)
        core = [s for s in scripts if "data-visits=" in s]
        check(len(core) == 1, f"{page.name}: one visits tag expected, found {len(core)}")
        if core:
            check(f'data-visits="{ANALYTICS["endpoint"]}"' in core[0], f"{page.name}: the visits tag's endpoint is not {ANALYTICS['endpoint']}")
            check(f'src="{prefix}assets/{want_core}"' in core[0], f"{page.name}: the visits tag's hash is not the vendored file's ({want_core}): stale build")
            check(" defer" in core[0], f"{page.name}: the visits tag is not deferred")
        vitals = [s for s in scripts if f"assets/{want_vitals}" in s]
        check(len(vitals) == 1, f"{page.name}: one vitals tag expected, found {len(vitals)}")
        if vitals:
            check(" defer" in vitals[0], f"{page.name}: the vitals tag is not deferred")
        others = [s for s in scripts if "data-visits=" not in s and f"assets/{want_vitals}" not in s]
        check(not others, f"{page.name}: scripts besides the two visits tags: {others}")
        if page.path.parent == PUBLIC / "research" and page.path.name != "index.html":
            check(page.html.count(" data-read-end") == 1, f"{page.name}: one data-read-end marker expected")
    csp = csp_from_config()
    check(csp.get("script-src") == ["'self'"], "script-src is not exactly 'self'")
    check(csp.get("connect-src") == ["'self'"], "connect-src is not exactly 'self'")
    check(csp.get("img-src") == ["'self'"], "img-src is not exactly 'self'")
```
Adapt the names `page.html`, `page.name`, `page.path`, `PUBLIC`, `SKILL`, `check`, `csp_from_config`, `hashlib`, `re` to what the file already uses (read the surrounding functions); the logic above is the contract.

- [ ] **Step 3: Run the checks**

Run: `nice -n 10 python3 .agents/skills/site-quality/scripts/check.py 2>&1 | tail -5`
Expected: `✓ site checks passed` (plus the known title-length warnings). Then prove it fails on a stale hash: `sed -i '' 's/assets\/visits\./assets\/visits.x/' public/404.html && python3 .agents/skills/site-quality/scripts/check.py 2>&1 | grep -c "stale build"; git checkout public/404.html`
Expected: `1`.

- [ ] **Step 4: Commit**

```bash
git add .agents/skills/site-quality/scripts/check.py
git commit -m "site-quality: the checks know lib-visits

The allowlist has no third-party origin; every page carries the two
tags with the vendored hashes, deferred, and nothing else; the CSP is
'self' on every script, connect and img directive."
```

---

