# Task 2 report: visits/deploy.sh

**Status:** DONE

## What was written
- `visits/deploy.sh` (chmod +x), verbatim from the brief.
- `visits/README.md`, verbatim from the brief.

## Commands and output
- `bash -n visits/deploy.sh`: passed (no output).
- `grep -c "—" visits/deploy.sh visits/README.md`: `0` and `0`.
- Brief Step 2, `VISITS_TAG=v9.9.9 visits/deploy.sh`: died at the Terraform output as the brief allows:
  `Error: Output "visits_service_name" not found` (plus the "terraform apply" hint). Exit 1.
- Extra check (scratch copy, Terraform `init` and `output` calls stubbed, not deployed):
  `VISITS_TAG=v9.9.9` gives `error: no tag v9.9.9 in /Users/csarko/Projects/lib-visits`. The tag guard works.
- lib-visits checkout: clean, HEAD `a751e17` equals `v0.1.0^{commit}`, so the happy path would pass the dirty and tag checks. Not run past that point (`gcloud run deploy` not executed).

## Commit
- `816e1ef visits: the collector's deploy script` (staged `visits/deploy.sh` and `visits/README.md` only; commit carries the Co-Authored-By line from the reminder).

## Self-review
- Every `die` path is reachable: missing terraform, missing gcloud, missing lib checkout, dirty checkout, unknown tag, HEAD not at tag, beacon not 204. The tag check is exercised; the others follow the same pattern.
- Dirty check: `git diff --quiet && git diff --cached --quiet || die` correctly catches unstaged or staged changes in lib-visits.
- Health check: `curl -fsS` fails the script under `set -e` if `/healthcheck` is not 2xx.
- Beacon check: `-w '%{http_code}'` with Origin `https://csarko.sh`; a non-204 answer dies. Note the `curl -s ... -d` POST uses a `-d` body without `-X`, which curl sends as POST; OK.
- Caveat: `curl -fsS` at the healthcheck line has no `|| die`; under `set -e` a failure exits the script with curl's error, but with no "error:" message. Acceptable, but a `|| die` would be clearer. Left as the brief specifies.

## Concerns
- The beacon check POSTs a `deploy-check` view to the live collector once deployed. It will be counted as a visit unless the dataset filters `id`/`p` values; worth confirming before the first real run.
- The `visits_service_name` Terraform output must exist (Task 3) before the script can run.

## Fix round 1 (coordinator review)
1. Dirty check now `git status --porcelain` (catches untracked files that `gcloud --source` would upload).
2. Healthcheck: `curl -fsS -m 20 ... || die "$SERVICE does not answer /healthcheck"`, success echo on its own line.
3. Beacon curl: `-m 20` and `-H 'Content-Type: text/plain'` added.
4. Checkout test: `git -C "$LIB" rev-parse --git-dir` (works for worktrees).
5. Source line prints the short SHA after the tag check.

Checks: `bash -n` passes; em-dash count 0; dry run still dies at `Error: Output "visits_service_name" not found` (expected, Task 3). lib-visits status is clean.
