import { afterEach, expect, it, vi } from 'vitest';
import { createGoogleState, validGoogleState, googleScopes, gscGrantAllowed, GSC_READONLY_SCOPE } from './google-oauth-policy';
afterEach(() => vi.unstubAllEnvs());
it('limits the pilot to Search Console read access and identity', () => {
  vi.stubEnv('SEO_GOOGLE_GSC_ONLY', '1');
  expect(googleScopes()).toEqual([GSC_READONLY_SCOPE, 'https://www.googleapis.com/auth/userinfo.email', 'openid']);
  expect(gscGrantAllowed(googleScopes().join(' '))).toBe(true);
  expect(gscGrantAllowed(`${GSC_READONLY_SCOPE} email openid`)).toBe(true);
  for (const extra of ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/business.manage', 'https://www.googleapis.com/auth/webmasters']) {
    expect(gscGrantAllowed(`${GSC_READONLY_SCOPE} ${extra}`)).toBe(false);
  }
  expect(gscGrantAllowed(undefined)).toBe(false);
  expect(gscGrantAllowed('openid email')).toBe(false);
});
it('binds unguessable state and client routing to the initiating browser', () => {
  const state = createGoogleState(['popup', 'clientId:1']);
  expect(state).not.toBe(createGoogleState(['popup', 'clientId:1']));
  expect(validGoogleState(state, state)).toBe(true);
  expect(validGoogleState(state, undefined)).toBe(false);
  expect(validGoogleState(state.replace('clientId:1','clientId:2'), state)).toBe(false);
  expect(validGoogleState('popup|clientId:1', 'popup|clientId:1')).toBe(false);
});
