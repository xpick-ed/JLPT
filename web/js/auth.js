const SESSION_KEY = 'vocabmatch.session';

// --- session storage (pure; browser localStorage) ---
export function getSession() {
  try { const raw = localStorage.getItem(SESSION_KEY); return raw ? JSON.parse(raw) : null; }
  catch { return null; }
}
export function setSession(obj) {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(obj)); } catch { /* private mode */ }
}
export function clearSession() {
  try { localStorage.removeItem(SESSION_KEY); } catch { /* private mode */ }
}

// --- Google Identity Services glue (browser only; verified via Playwright/manual) ---
function whenReady() {
  return new Promise((resolve) => {
    let n = 0;
    const t = setInterval(() => {
      if (window.google && window.google.accounts && window.google.accounts.id) { clearInterval(t); resolve(true); }
      else if (++n > 50) { clearInterval(t); resolve(false); }   // give up after ~5s
    }, 100);
  });
}
let _initP = null;   // resolves once id.initialize() has run, so renderButton can await it
export function initGoogle(clientId, onCredential) {
  _initP = (async () => {
    if (!clientId || !(await whenReady())) return false;
    window.google.accounts.id.initialize({ client_id: clientId, callback: (resp) => onCredential(resp.credential) });
    return true;
  })();
  return _initP;
}
export async function renderButton(el) {
  if (!el) return;
  // wait for initialize() (so the button's click wires the callback); if initGoogle
  // was never called, fall back to just waiting for the library.
  const ok = _initP ? await _initP : await whenReady();
  if (!ok) return;
  el.innerHTML = '';
  window.google.accounts.id.renderButton(el, { theme: 'outline', size: 'large', type: 'standard', text: 'signin_with' });
}
