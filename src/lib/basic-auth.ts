import { createHmac, randomBytes } from "node:crypto";
import { compare } from "bcryptjs";

const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CACHE_ENTRIES = 32;

// Each server process has its own bounded cache. Restarts simply require re-verification.
export function createPasswordVerifier(
  verify: (password: string, hash: string) => Promise<boolean> = compare,
) {
  const fingerprintKey = randomBytes(32);
  const cache = new Map<string, { result: Promise<boolean>; expiresAt: number }>();

  return function verifyPassword(password: string, username: string, passwordHash: string): Promise<boolean> {
    // Include configuration so credential rotation cannot reuse an old verification.
    // Keep only keyed fingerprints in the cache, never passwords or auth headers.
    const key = createHmac("sha256", fingerprintKey)
      .update(JSON.stringify([username, passwordHash, password]))
      .digest("hex");
    const now = Date.now();
    for (const [key, entry] of cache) {
      if (entry.expiresAt <= now) cache.delete(key);
    }
    const cached = cache.get(key);
    if (cached) return cached.result;

    if (cache.size >= MAX_CACHE_ENTRIES) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }

    const entry = {
      result: Promise.resolve(false),
      expiresAt: now + CACHE_TTL_MS,
    };
    entry.result = Promise.resolve().then(async () => {
      let valid = false;
      try {
        valid = await verify(password, passwordHash);
        if (valid) entry.expiresAt = Date.now() + CACHE_TTL_MS;
        return valid;
      } finally {
        // Failed checks are shared only while in flight, never retained afterward.
        if (!valid && cache.get(key) === entry) cache.delete(key);
      }
    });
    cache.set(key, entry);
    return entry.result;
  };
}
