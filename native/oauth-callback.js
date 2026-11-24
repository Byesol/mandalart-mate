export const callbackUrl = 'io.github.byesol.mandalartmate://auth/callback';

const expected = new URL(callbackUrl);

export function readOAuthCallback(value) {
  if (typeof value !== 'string' || value.length > 8192) return null;
  let actual;
  try { actual = new URL(value); } catch { return null; }
  if (actual.protocol !== expected.protocol || actual.host !== expected.host ||
      actual.pathname !== expected.pathname || actual.username || actual.password) return null;
  if (actual.searchParams.has('error') || new URLSearchParams(actual.hash.slice(1)).has('error')) return {error: true};
  const codes = actual.searchParams.getAll('code');
  if (actual.hash || codes.length !== 1 || !/^[a-zA-Z0-9._~-]{8,4096}$/.test(codes[0])) return null;
  return {code: codes[0]};
}
