# Task 10 report
Changed: admin/public/csarko.sh/page.js (hint key goatcounter->visits everywhere, Median engaged and Read to the end columns, Paths through the site folded table, four new Audience sections + summary top('themes'), Visitors sub with brief sentence plus the cutover sentence, header comment updated); sample/csarko.sh/{pages,referrers,audience}.json (new fields; files were re-serialized so diff is larger than the additions).
Shots: both themes render the new columns (one sample row has nulls, blank cells) and the collapsed Paths and Audience folds with summaries; no overflow. Audience summary shows "... Dark 68%".
check.py --admin: passed. grep -i goatcounter in page.js: only the required cutover sentence.
Concern: sample viewport bucket labels are invented (Under 480 etc.), not taken from the API.

## Fix round 1
Sample viewports labels now under 400, 400 to 799, 800 to 1199, 1200 and up (counts unchanged). check.py --admin passed. Concern about invented labels resolved.

## Fix round 1 (7c5a094)
Sample viewports labels replaced with the API strings (under 400, 400 to 799, 800 to 1199, 1200 and up); counts unchanged; check.py --admin passed.
