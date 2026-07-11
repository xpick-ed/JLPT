export async function hashKey(passphrase) {
  const data = new TextEncoder().encode(passphrase);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function pull(workerUrl, key) {
  try {
    const r = await fetch(`${workerUrl}?key=${key}`);
    if (!r.ok) return null;
    const s = await r.json();
    return s && Object.keys(s).length ? s : null;
  } catch { return null; }
}

export async function push(workerUrl, key, state) {
  try {
    const r = await fetch(`${workerUrl}?key=${key}`, {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(state),
    });
    return r.ok;
  } catch { return false; }
}
