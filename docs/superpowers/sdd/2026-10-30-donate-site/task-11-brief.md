### Task 11: The Finance page: tips by door and the month's prices

**Files:**
- Modify: `admin/public/finance/page.js` (`donationsCard`: a "By door" fold and the prices line; the card's `sub` and `skeleton`)
- Test: `python3 .agents/skills/site-quality/scripts/check.py --admin` (the page's checks drive the Billing page in headless Chrome)

**Interfaces:**
- Consumes: `income.byDoor` and `income.prices` (Task 4); `folded`, `table`, `el`, `money`, `count`, `monthName`, `ago` from the page's helpers.
- Produces: in `donationsCard`, after the balance line, `el('p', { class: 'note' }, ...)` reading `Tip prices follow ${monthName(prices.month)}'s bill, ${money(prices.pool)}, set ${ago(prices.at)}.` when `income.prices` is an object, else `Tip prices: not set yet; the donate step runs on the first snapshot on or after the 3rd.`; a fold `By door · ${byDoor.length}` with columns Door (`label`), Gross, Fees, Net, Donations, empty text `No tips through a door yet.`, placed before the Recent fold; `skeleton.folds` becomes 4; the `sub` gains one sentence: "By door says which project's page the tip came through; nothing more about the giver."

- [ ] **Step 1: Edit `page.js` to the Interfaces block**

- [ ] **Step 2: Run the admin checks and look**

Run: `python3 .agents/skills/site-quality/scripts/check.py --admin && admin/preview.sh --shots`
Expected: green (the fold is a `<details>` through `folded()`, so the motion and skeleton checks hold; the fifth project tone from Task 1 passes the palette check); in the screenshots the Donations card shows the prices line and the fold in both themes.

- [ ] **Step 3: Deploy the admin site**

Run: `admin/deploy.sh`

- [ ] **Step 4: Commit**

```bash
git add admin/public/finance/page.js
git commit -m "finance: tips by door and the month's tip prices on the Donations card"
```

---

