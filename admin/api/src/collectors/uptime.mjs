/**
 * Is the site up, how fast does it answer, and how long is its certificate
 * good for. One `HEAD` to the home page measures time to first byte; the TLS
 * handshake on a plain socket reads the certificate's `valid_to`, which the
 * fetch API does not expose. Both are cheap and run live on every health
 * read (cached one minute, so the index page's dot and the health card
 * share a measurement).
 */

import tls from "node:tls";

export function createUptime({ siteUrl, fetch, cache, ttlMs = 60_000, now = Date.now, connect = tlsConnect, timeoutMs = 10_000 }) {
  const host = new URL(siteUrl).hostname;

  return {
    /** `{ up, status, ttfbMs, certDaysLeft }`. Never throws: a site that is down is a result, not an error. */
    check() {
      return cache.get(`uptime:${siteUrl}`, ttlMs, async () => {
        const [head, cert] = await Promise.all([headCheck(), certCheck()]);
        return { ...head, ...cert };
      });
    },
  };

  async function headCheck() {
    const started = now();
    try {
      const res = await fetch(`${siteUrl}/`, { method: "HEAD", redirect: "manual", signal: AbortSignal.timeout(timeoutMs), headers: { "user-agent": "csarko-admin uptime" } });
      return { up: res.status >= 200 && res.status < 400, status: res.status, ttfbMs: now() - started };
    } catch {
      return { up: false, status: null, ttfbMs: null };
    }
  }

  async function certCheck() {
    try {
      const validTo = await connect(host, timeoutMs);
      return { certDaysLeft: certDaysLeft(validTo, now()) };
    } catch {
      return { certDaysLeft: null };
    }
  }
}

/** Whole days until `validTo` (a certificate's date string), rounded down; negative once expired. */
export function certDaysLeft(validTo, nowMs) {
  const t = Date.parse(validTo);
  if (Number.isNaN(t)) return null;
  return Math.floor((t - nowMs) / 86_400_000);
}

function tlsConnect(host, timeoutMs) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host, port: 443, servername: host, timeout: timeoutMs }, () => {
      const cert = socket.getPeerCertificate();
      socket.end();
      if (!cert || !cert.valid_to) reject(new Error("no peer certificate"));
      else resolve(cert.valid_to);
    });
    socket.on("timeout", () => {
      socket.destroy();
      reject(new Error("tls timeout"));
    });
    socket.on("error", reject);
  });
}
