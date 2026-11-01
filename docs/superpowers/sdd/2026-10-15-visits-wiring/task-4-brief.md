### Task 4: The site generator: `site.json`, the vendored scripts, `build_assets.py`

**Files:**
- Modify: `.agents/skills/site-quality/site.json`, `.agents/skills/site-quality/scripts/build_assets.py:9-28,79-83,254-279`
- Create: `.agents/skills/site-quality/assets/vendor/visits.min.js`, `.agents/skills/site-quality/assets/vendor/vitals.min.js`
- Delete: `.agents/skills/site-quality/assets/vendor/goatcounter-count.js`, `.agents/skills/site-quality/assets/engage.js`

**Interfaces:**
- Produces: `site.json` `{ "analytics": { "provider": "visits", "endpoint": "/v" } }`; the generated analytics block on every page:
  ```html
  <script defer src="{prefix}assets/visits.<hash>.js" data-visits="/v"></script>
  <script defer src="{prefix}assets/vitals.<hash>.js"></script>
  ```
  (`defer` keeps the order, so vitals finds `window.visits`); CSP `script-src 'self'; connect-src 'self'; img-src 'self'`.

- [ ] **Step 1: Vendor the two files with a provenance line**

```bash
LIB=~/Projects/lib-visits; git -C "$LIB" checkout -q v0.1.0
for f in visits vitals; do
  { printf '// lib-visits v0.1.0 (GPL-3.0-only), client/dist/%s.min.js, sha256 %s\n' "$f" "$(shasum -a 256 "$LIB/client/dist/$f.min.js" | cut -c1-64)"; cat "$LIB/client/dist/$f.min.js"; echo; } > .agents/skills/site-quality/assets/vendor/$f.min.js
done
git -C "$LIB" checkout -q main
git rm -q .agents/skills/site-quality/assets/vendor/goatcounter-count.js .agents/skills/site-quality/assets/engage.js
```
`strip_comments` (`build_assets.py:114`) drops the `//` line before hashing, so the served file is byte-identical to the tag's.

- [ ] **Step 2: `site.json`**

```json
{
  "analytics": {
    "provider": "visits",
    "endpoint": "/v"
  }
}
```

- [ ] **Step 3: `build_assets.py`**

Replace lines 79-83 (`analytics_origin`) with:
```python
def analytics():
    """The analytics config, or None when `provider` is null: `{"endpoint": "/v"}` for lib-visits."""
    a = CONFIG.get("analytics") or {}
    if a.get("provider") == "visits" and a.get("endpoint"):
        return {"endpoint": a["endpoint"]}
    return None
```
Replace lines 254-270 (the analytics block, from the `# ---- analytics` comment through the `analytics(prefix, slug)` function) with:
```python
    # ---- analytics: lib-visits, self-hosted, the beacon to the same origin (/v is a Hosting
    # rewrite to the collector), so the page makes no third-party request. The vendored
    # copies carry a provenance line that strip_comments drops before hashing, so the served
    # bytes are the tag's.
    conf = analytics()
    core = vitals = None
    if conf:
        core = write_hashed("visits", "js", strip_comments((SRC / "vendor/visits.min.js").read_bytes()), keep)
        vitals = write_hashed("vitals", "js", strip_comments((SRC / "vendor/vitals.min.js").read_bytes()), keep)

    def analytics_block(prefix, slug):
        if not core:
            return ""
        return (
            f'\n  <script defer src="{prefix}assets/{core}" data-visits="{conf["endpoint"]}"></script>'
            f'\n  <script defer src="{prefix}assets/{vitals}"></script>\n  '
        )
```
Replace lines 273-279 (the CSP directives) with:
```python
    directives = {k: list(v) for k, v in CSP}
    if conf:
        directives["script-src"].append("'self'")
    csp = "; ".join(k if not v else f"{k} {' '.join(v)}" for k, v in directives.items())
```
(keep whatever the current join expression is if it differs; only the `if origin:` block changes). In the blocks dict (line ~312) rename the call to `analytics_block(prefix, slug)`. Update the docstring lines 9, 15 and 28 to name `vendor/visits.min.js` and `vendor/vitals.min.js` and drop `engage.js`.

- [ ] **Step 4: Generate and look**

Run: `nice -n 10 .agents/skills/site-quality/scripts/generate-assets.sh 2>&1 | tail -3 && grep -n "visits\.\|vitals\.\|goatcounter" public/index.html public/404.html | head && grep -o 'script-src[^;]*; connect-src[^;]*; img-src[^;]*' firebase.json`
Expected: two tags per page with hashes, no `goatcounter` anywhere in `public/*.html`, and `script-src 'self'; connect-src 'self'; img-src 'self'`. (`check.py` will fail until Task 5 rewrites its analytics checks; that is expected here. The research pages still carry `data-goatcounter-click` until Task 6.)

- [ ] **Step 5: Commit**

```bash
git add .agents/skills/site-quality/site.json .agents/skills/site-quality/scripts/build_assets.py .agents/skills/site-quality/assets/vendor public/assets public/*.html public/research public/games public/film firebase.json
git commit -m "site: lib-visits replaces count.js and engage.js

site.json names the provider and the endpoint; build_assets vendors
the tag's two scripts, writes their tags on every page and derives a
CSP with no third-party origin."
```

---

