// Emulator-only helpers: Admin REST with `Bearer owner` bypasses security rules (seeding), plus Auth emulator calls.
const PROJECT = 'demo-tryline';
const FS = `http://127.0.0.1:8085/v1/projects/${PROJECT}/databases/(default)/documents`;
const AUTH = 'http://127.0.0.1:9099';
const OWNER = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };

type FsValue = Record<string, unknown>;

export function toValue(v: unknown): FsValue {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v as object).map(([k, x]) => [k, toValue(x)])) } };
}

export function fromValue(v: FsValue): unknown {
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return ((v.arrayValue as { values?: FsValue[] }).values ?? []).map(fromValue);
  if ('mapValue' in v) return Object.fromEntries(Object.entries((v.mapValue as { fields?: Record<string, FsValue> }).fields ?? {}).map(([k, x]) => [k, fromValue(x)]));
  return undefined;
}

export async function resetEmulators(): Promise<void> {
  await fetch(`http://127.0.0.1:8085/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  await fetch(`${AUTH}/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
}

/** Writes a document, bypassing rules. */
export async function seedDoc(path: string, data: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${FS}/${path}`, {
    method: 'PATCH', headers: OWNER,
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, toValue(v)])) }),
  });
  if (!res.ok) throw new Error(`seed ${path} failed: ${res.status} ${await res.text()}`);
}

/** Lists a top-level collection (rules bypassed). Each item has `id`. */
export async function listDocs<T = Record<string, unknown>>(collection: string): Promise<Array<T & { id: string }>> {
  const out: Array<T & { id: string }> = [];
  let token = '';
  do {
    const res = await fetch(`${FS}/${collection}?pageSize=300${token ? `&pageToken=${token}` : ''}`, { headers: OWNER });
    const body = (await res.json()) as { documents?: Array<{ name: string; fields?: Record<string, FsValue> }>; nextPageToken?: string };
    for (const d of body.documents ?? []) {
      const fields = Object.fromEntries(Object.entries(d.fields ?? {}).map(([k, v]) => [k, fromValue(v)]));
      out.push({ ...fields, id: d.name.split('/').pop() as string } as T & { id: string });
    }
    token = body.nextPageToken ?? '';
  } while (token);
  return out;
}

export async function createAuthUser(email: string, password: string, verified: boolean): Promise<string> {
  const res = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const body = (await res.json()) as { localId: string };
  if (!body.localId) throw new Error('could not create auth user');
  if (verified) {
    await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:update`, {
      method: 'POST', headers: OWNER, body: JSON.stringify({ localId: body.localId, emailVerified: true }),
    });
  }
  return body.localId;
}

/** Latest email-verification link the Auth emulator "sent" to this address. */
export async function verificationLink(email: string): Promise<string> {
  const res = await fetch(`${AUTH}/emulator/v1/projects/${PROJECT}/oobCodes`);
  const body = (await res.json()) as { oobCodes: Array<{ email: string; requestType: string; oobLink: string }> };
  const mine = body.oobCodes.filter((c) => c.email === email && c.requestType === 'VERIFY_EMAIL');
  if (!mine.length) throw new Error(`no verification code for ${email}`);
  return mine[mine.length - 1].oobLink;
}

/** Reads one document (rules bypassed); null if missing. */
export async function readDoc<T = Record<string, unknown>>(path: string): Promise<T | null> {
  const res = await fetch(`${FS}/${path}`, { headers: OWNER });
  if (res.status === 404) return null;
  const d = (await res.json()) as { fields?: Record<string, FsValue> };
  return Object.fromEntries(Object.entries(d.fields ?? {}).map(([k, v]) => [k, fromValue(v)])) as T;
}
