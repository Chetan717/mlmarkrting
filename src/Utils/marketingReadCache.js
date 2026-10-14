// Short, auth-scoped, in-memory query reuse for Marketing UI tabs.
// Does not persist data, bypass Firebase rules, or cache failed reads.
const readCache = new Map();
const running = new Map();
const revisions = new Map();
const MAX_ENTRIES = 16;

function makeKey(uid, name) {
  return uid && name ? JSON.stringify([String(uid), String(name)]) : '';
}
function purgeExpired() {
  const now = Date.now();
  for (const [key, item] of readCache) if (item.until <= now) readCache.delete(key);
}
export function invalidateMarketingRead(uid, name) {
  const key = makeKey(uid, name);
  if (!key) return;
  revisions.set(key, (revisions.get(key) || 0) + 1);
  // Bound refresh generations too: refresh-heavy sessions must not leak memory.
  if (revisions.size > 128) {
    for (const oldKey of revisions.keys()) {
      if (oldKey !== key && !running.has(oldKey)) { revisions.delete(oldKey); break; }
    }
  }
  readCache.delete(key);
  running.delete(key);
}

export async function cachedMarketingRead(uid, name, load, {
  ttlMs = 60000, maxRows = 2500, force = false,
} = {}) {
  if (typeof load !== 'function') throw new TypeError('loader required');
  const key = makeKey(uid, name);
  if (!key) return load(); // A missing authenticated user must never share data.
  purgeExpired();
  if (force) invalidateMarketingRead(uid, name);
  const cached = readCache.get(key);
  if (cached) return cached.data;
  if (running.has(key)) return running.get(key);
  const version = revisions.get(key) || 0;
  const promise = Promise.resolve().then(load);
  running.set(key, promise);
  try {
    const data = await promise;
    const rows = Array.isArray(data) ? data.length : 0;
    if ((revisions.get(key) || 0) === version && ttlMs > 0 && rows <= maxRows) {
      if (readCache.size >= MAX_ENTRIES) readCache.delete(readCache.keys().next().value);
      readCache.set(key, { data, until: Date.now() + ttlMs });
    }
    return data;
  } finally {
    if (running.get(key) === promise) running.delete(key);
  }
}

export function clearMarketingReadCache() {
  readCache.clear();
  running.clear();
  revisions.clear();
}

export async function getSuccessfulSubscriptionRows({ uid, couponCode, load, force = false, source = 'subscription' }) {
  return cachedMarketingRead(uid, `subscription-success:${source}:${couponCode}`, load, {
    ttlMs: 60000, maxRows: 4000, force,
  });
}
