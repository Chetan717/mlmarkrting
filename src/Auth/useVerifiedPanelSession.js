import { useCallback, useEffect, useRef, useState } from "react";
import { onIdTokenChanged, signOut } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { auth, functions } from "../../Firebase";

const denied = error => /(?:unauthenticated|permission-denied|user-disabled|user-token-expired|invalid-user-token)$/.test(String(error?.code || ""));

// Firebase Auth persists its own credentials. A restored credential is accepted
// only after the backend validates today's unrevoked panel session.
export function useVerifiedPanelSession({ panel, statusEndpoint, logoutEndpoint, buildSession, save, clear }) {
  const [state, setState] = useState({ loading: true, session: null, error: "" });
  const [attempt, setAttempt] = useState(0);
  const invalidate = useRef(() => {});
  const loggingOut = useRef(false);

  useEffect(() => {
    let active = true, authReady = false, revision = 0, timer = null, pending = null;
    const reset = () => {
      revision += 1;
      clearTimeout(timer);
      clear();
      if (active) setState({ loading: false, session: null, error: "" });
    };
    invalidate.current = reset;

    const validate = user => {
      if (!active || loggingOut.current) return Promise.resolve();
      if (!user) { reset(); return Promise.resolve(); }
      if (pending?.uid === user.uid) return pending.promise;
      const version = ++revision;
      const current = () => active && version === revision && auth.currentUser?.uid === user.uid && !loggingOut.current;
      setState(previous => ({ ...previous, loading: !previous.session, error: "" }));
      const promise = (async () => {
        try {
          const token = await user.getIdTokenResult();
          if (!current()) return;
          if (token.claims.panel !== panel) { reset(); return; }
          const result = await httpsCallable(functions, statusEndpoint)({});
          if (!current()) return;
          const status = result.data || {};
          const remaining = Number(status.expiresAt) - Number(status.serverNow);
          if (status.valid !== true || !Number.isFinite(remaining) || remaining <= 0) {
            reset();
            await signOut(auth).catch(() => null);
            return;
          }
          const session = { ...buildSession(user, token.claims, status.account || {}), _expiresAt: status.expiresAt };
          save(session);
          setState({ loading: false, session, error: "" });
          clearTimeout(timer);
          timer = setTimeout(() => {
            if (!active || auth.currentUser?.uid !== user.uid) return;
            reset();
            void signOut(auth).catch(() => null);
          }, remaining);
        } catch (error) {
          if (!current()) return;
          if (denied(error)) {
            reset();
            await signOut(auth).catch(() => null);
          } else {
            // A network outage must not turn into another OTP challenge.
            setState(previous => previous.session ? previous : {
              loading: true, session: null, error: "Session verify nahi ho paya. Connection check karke dobara try karein.",
            });
          }
        }
      })().finally(() => { if (pending?.promise === promise) pending = null; });
      pending = { uid: user.uid, promise };
      return promise;
    };

    const unsubscribe = onIdTokenChanged(auth, user => { authReady = true; void validate(user); });
    const restore = () => { if (authReady && document.visibilityState === "visible") void validate(auth.currentUser); };
    window.addEventListener("focus", restore);
    document.addEventListener("visibilitychange", restore);
    return () => {
      active = false;
      revision += 1;
      clearTimeout(timer);
      unsubscribe();
      window.removeEventListener("focus", restore);
      document.removeEventListener("visibilitychange", restore);
    };
  }, [panel, statusEndpoint, buildSession, save, clear, attempt]);

  const logout = useCallback(async () => {
    loggingOut.current = true;
    const uid = auth.currentUser?.uid;
    invalidate.current();
    try {
      if (uid) await httpsCallable(functions, logoutEndpoint)({});
    } catch { /* Local sign-out must still complete when the connection fails. */ }
    finally {
      if (auth.currentUser?.uid === uid) await signOut(auth).catch(() => null);
      loggingOut.current = false;
    }
  }, [logoutEndpoint]);
  const retry = useCallback(() => setAttempt(value => value + 1), []);
  return { ...state, unlocked: Boolean(state.session), logout, retry };
}
