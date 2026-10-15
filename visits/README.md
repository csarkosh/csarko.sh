# visits/

csarko.sh's deployment of [lib-visits](https://github.com/csarkosh/lib-visits): the
collector behind `https://csarko.sh/v`. Terraform (`_infra/modules/gcp-visits`) owns the
service, its secret, the log bucket and the datasets; `deploy.sh` owns the image, built by
Cloud Build from the library checkout at `VISITS_TAG`; `backfill.mjs` loaded GoatCounter's
history once. The site's tags and CSP come from `site.json` (`provider: visits`), and the
dashboard reads the `csarko_visits` and `csarko_history` datasets.

Proxy depth: the service runs with `--trusted-proxies <n>` from Terraform; `<n>` was
confirmed with `--log-ip` on first deploy (see the "As built" note in the wiring spec).
