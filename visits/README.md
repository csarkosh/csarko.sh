# visits/

csarko.sh's deployment of [lib-visits](https://github.com/csarkosh/lib-visits): the
collector behind `https://csarko.sh/v`. Terraform (`_infra/modules/gcp-visits`) owns the
service, its secret, the log bucket and the datasets; `deploy.sh` owns the image, built by
Cloud Build from the library checkout at `VISITS_TAG`; `backfill.mjs` loaded GoatCounter's
history once, from the stats API through `goatcounter-api.mjs` (GoatCounter's CSV export of
the site was empty: it kept no per-hit rows, only hourly stats). The site's tags and CSP come from `site.json` (`provider: visits`), and the
dashboard reads the `csarko_visits` and `csarko_history` datasets.

Proxy depth: the service runs with `--trusted-proxies 2` from Terraform (Hosting's rewrite and
Cloud Run's frontend), confirmed with `--log-ip` through `https://csarko.sh/v` at the cutover
(see the "As built" notes in the wiring spec).
