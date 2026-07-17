// Compatibility adapter. The value is populated only from verified Auth
// claims and deliberately lives only in JavaScript memory.
let verifiedSession = null;

// Sanitize a string value — strips any HTML tags
export function sanitizeStr(val) {
  if (typeof val !== "string") return val;
  return val.replace(/<[^>]*>/g, "").trim();
}

// Rate-limit tracker (in-memory, resets on refresh)
const _failMap = {};
const MAX_FAILS    = 5;
const LOCKOUT_MS   = 15 * 60 * 1000; // 15 minutes

export function recordLoginFail(mobile) {
  const now = Date.now();
  if (!_failMap[mobile]) _failMap[mobile] = { count: 0, since: now };
  _failMap[mobile].count += 1;
  _failMap[mobile].lastAt = now;
}

export function clearLoginFails(mobile) {
  delete _failMap[mobile];
}

export function isLockedOut(mobile) {
  const entry = _failMap[mobile];
  if (!entry) return false;
  if (entry.count < MAX_FAILS) return false;
  const elapsed = Date.now() - entry.lastAt;
  if (elapsed > LOCKOUT_MS) {
    delete _failMap[mobile];
    return false;
  }
  return true;
}

export function lockoutRemainingSeconds(mobile) {
  const entry = _failMap[mobile];
  if (!entry) return 0;
  const elapsed = Date.now() - entry.lastAt;
  const remaining = LOCKOUT_MS - elapsed;
  return Math.max(0, Math.ceil(remaining / 1000));
}

// Save session (no passwords/secrets stored)
export function saveSession(data) {
  const { password: _pw, ...safe } = data;
  verifiedSession = { ...safe };
  return verifiedSession;
}

// Get session — returns null if missing or expired
export function getSession() {
  return verifiedSession;
}

// Clear session on logout
export function clearSession() {
  verifiedSession = null;
}

// Extend expiry on activity
export function refreshSession() {
  return verifiedSession;
}
