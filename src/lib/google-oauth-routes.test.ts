import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as begin } from '../app/api/google/auth/route';
import { GET as callback } from '../app/api/google/callback/route';
import { GOOGLE_STATE_COOKIE, GSC_READONLY_SCOPE } from './google-oauth-policy';

const mocks = vi.hoisted(() => ({ exchange: vi.fn(), save: vi.fn(), cookie: vi.fn() }));
vi.mock('./google-oauth', async importOriginal => {
  const original = await importOriginal<typeof import('./google-oauth')>();
  return { ...original, getGoogleClientCredentials: vi.fn(async () => ({ clientId: 'synthetic', clientSecret: 'synthetic' })), exchangeCodeForTokens: mocks.exchange, fetchGoogleUserEmail: vi.fn(async () => 'synthetic@example.com') };
});
vi.mock('next/headers', () => ({ cookies: async () => ({ set: mocks.cookie }) }));
vi.mock('./settings-store', () => ({ setSetting: mocks.save, getSetting: vi.fn(), deleteSetting: vi.fn() }));
vi.mock('@/db/client', () => ({ db: {} }));
vi.mock('./crypto', () => ({ encrypt: (v: string) => `encrypted:${v}`, decrypt: vi.fn() }));
vi.mock('./activity', () => ({ logActivity: vi.fn() }));
vi.mock('./gmail-scope', () => ({ refreshGmailScopeCache: vi.fn() }));
beforeEach(() => { vi.stubEnv('SEO_GOOGLE_GSC_ONLY', '1'); vi.clearAllMocks(); });
afterEach(() => vi.unstubAllEnvs());

async function start() {
  const result = await begin(new NextRequest('http://127.0.0.1:3100/api/google/auth'));
  const auth = new URL(result.headers.get('location')!);
  const cookie = result.cookies.get(GOOGLE_STATE_COOKIE)!;
  return { auth, cookie };
}
it('issues a restricted authorization request with expiring HttpOnly state', async () => {
  const { auth, cookie } = await start();
  expect(auth.searchParams.get('include_granted_scopes')).toBe('false');
  expect(auth.searchParams.get('scope')?.split(' ')).toEqual([GSC_READONLY_SCOPE, 'https://www.googleapis.com/auth/userinfo.email', 'openid']);
  expect(auth.searchParams.get('state')).toBe(cookie.value);
  expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'lax', maxAge: 600, path: '/api/google' });
});
it('rejects an unsolicited callback before token exchange', async () => {
  const response = await callback(new NextRequest('http://127.0.0.1:3100/api/google/callback?code=synthetic&state=popup'));
  expect(response.headers.get('location')).toContain('invalid-state');
  expect(mocks.exchange).not.toHaveBeenCalled();
  expect(mocks.save).not.toHaveBeenCalled();
});
it('rejects broad grants and consumes valid state before storing anything', async () => {
  const { cookie } = await start();
  mocks.exchange.mockResolvedValue({ access_token: 'synthetic', refresh_token: 'synthetic', expires_in: 3600, scope: `${GSC_READONLY_SCOPE} https://www.googleapis.com/auth/gmail.readonly` });
  const response = await callback(new NextRequest(`http://127.0.0.1:3100/api/google/callback?code=synthetic&state=${encodeURIComponent(cookie.value)}`, { headers: { cookie: `${GOOGLE_STATE_COOKIE}=${cookie.value}` } }));
  expect(response.headers.get('location')).toContain('unexpected-scopes');
  expect(mocks.cookie).toHaveBeenCalledWith(GOOGLE_STATE_COOKIE, '', { path: '/api/google', maxAge: 0 });
  expect(mocks.save).not.toHaveBeenCalled();
});
it('stores only an accepted read-only grant after a matching callback', async () => {
  const { cookie } = await start();
  mocks.exchange.mockResolvedValue({ access_token: 'synthetic', refresh_token: 'synthetic', expires_in: 3600, scope: `${GSC_READONLY_SCOPE} openid email` });
  const response = await callback(new NextRequest(`http://127.0.0.1:3100/api/google/callback?code=synthetic&state=${encodeURIComponent(cookie.value)}`, { headers: { cookie: `${GOOGLE_STATE_COOKIE}=${cookie.value}` } }));
  expect(response.headers.get('location')).toContain('connected=1');
  expect(mocks.save).toHaveBeenCalledWith('google.refresh_token', 'encrypted:synthetic');
});

it('keeps callback redirects on the public Docker host port', async () => {
  const response = await callback(new NextRequest('http://localhost:3000/api/google/callback?code=synthetic&state=forged', { headers: { host: '127.0.0.1:3100' } }));
  expect(new URL(response.headers.get('location')!).origin).toBe('http://127.0.0.1:3100');
});
