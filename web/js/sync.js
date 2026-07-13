export async function exchangeSession(workerUrl, credential) {
  try {
    const r = await fetch(`${workerUrl}/session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ credential }),
    });
    if (!r.ok) return null;
    return await r.json();   // { session, email, name }
  } catch { return null; }
}

export async function pull(workerUrl, session) {
  try {
    const r = await fetch(`${workerUrl}/data`, { headers: { authorization: `Bearer ${session}` } });
    if (!r.ok) return null;
    const s = await r.json();
    return s && Object.keys(s).length ? s : null;
  } catch { return null; }
}

export async function push(workerUrl, session, state) {
  try {
    const r = await fetch(`${workerUrl}/data`, {
      method: 'PUT',
      headers: { authorization: `Bearer ${session}`, 'content-type': 'application/json' },
      body: JSON.stringify(state),
    });
    return r.ok;
  } catch { return false; }
}
