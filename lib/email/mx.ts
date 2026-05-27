// Memoized MX lookup. Used by email enrichment to verify that a guessed
// email's domain actually accepts mail before we persist the candidate.
// A successful MX lookup proves the domain is set up to receive mail; it
// does NOT prove any particular mailbox exists (catch-all servers accept
// anything). For mailbox-level verification we'd need an SMTP probe or
// a paid service.

import { resolveMx } from "node:dns/promises";

const cache = new Map<string, { ok: boolean; expiresAt: number }>();
const TTL_MS = 1000 * 60 * 60; // 1 hour

export async function hasMx(domain: string): Promise<boolean> {
  const key = domain.toLowerCase();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.ok;

  let ok = false;
  try {
    const records = await resolveMx(key);
    ok = Array.isArray(records) && records.length > 0;
  } catch {
    ok = false;
  }
  cache.set(key, { ok, expiresAt: Date.now() + TTL_MS });
  return ok;
}
