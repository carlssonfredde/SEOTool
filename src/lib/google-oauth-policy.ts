import { randomBytes, timingSafeEqual } from 'node:crypto';

export const GOOGLE_STATE_COOKIE = 'seo_google_oauth_state';
export const GSC_READONLY_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
const identityScopes = ['https://www.googleapis.com/auth/userinfo.email', 'openid'];
export function gscOnlyMode() { return process.env.SEO_GOOGLE_GSC_ONLY === '1'; }
export function googleScopes() {
  return gscOnlyMode()
    ? [GSC_READONLY_SCOPE, ...identityScopes]
    : [GSC_READONLY_SCOPE, 'https://www.googleapis.com/auth/analytics.readonly', 'https://www.googleapis.com/auth/business.manage', 'https://www.googleapis.com/auth/gmail.readonly', ...identityScopes];
}
export function gscGrantAllowed(scope: string | undefined) {
  const granted = scope?.split(/\s+/).filter(Boolean) ?? [];
  const allowed = new Set([GSC_READONLY_SCOPE, ...identityScopes, 'email']);
  return granted.includes(GSC_READONLY_SCOPE) && granted.every(s => allowed.has(s));
}
export function createGoogleState(parts: string[]) {
  return [randomBytes(32).toString('base64url'), ...parts].join('|');
}
export function validGoogleState(state: string, cookie: string | undefined) {
  if (!cookie || !/^[A-Za-z0-9_-]{43}(?:\||$)/.test(state)) return false;
  const actual = Buffer.from(state); const expected = Buffer.from(cookie);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
