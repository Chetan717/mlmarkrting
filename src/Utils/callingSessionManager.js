let verifiedCallingSession = null;

export function saveCallingSession(data) {
  const { password: _password, ...safe } = data || {};
  verifiedCallingSession = { ...safe };
  return verifiedCallingSession;
}

export function getCallingSession() {
  return verifiedCallingSession;
}

export function clearCallingSession() {
  verifiedCallingSession = null;
}
