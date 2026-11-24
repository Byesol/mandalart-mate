import {App} from '@capacitor/app';
import {Browser} from '@capacitor/browser';
import {SecureStorage, KeychainAccess} from '@aparajita/capacitor-secure-storage';
import {createClient} from '@supabase/supabase-js';
import {callbackUrl, readOAuthCallback} from './oauth-callback.js';

const providers = new Set(['google', 'kakao', 'apple']);
const attemptTimeout = 15 * 60 * 1000;

export function createNativeAuth(config) {
  const listeners = new Set();
  const configured = Boolean(config);
  const storageKey = configured ? 'mm-auth-' + new URL(config.authUrl).hostname : '';
  const attemptKey = storageKey + '-attempt';
  let client;
  let session = null;
  let ready = !configured;
  let pending = false;
  let completing = false;
  let error = '';

  function state() {
    return {configured, ready, pending, error, user: session?.user?.id ?? null};
  }

  function notify() {
    for (const listener of listeners) listener(state());
  }

  const initialized = configured ? initialize() : Promise.resolve();

  async function initialize() {
    try {
      await SecureStorage.setSynchronize(false);
      await SecureStorage.setDefaultKeychainAccess(KeychainAccess.afterFirstUnlockThisDeviceOnly);
      client = createClient(config.authUrl, config.key, {
        auth: {
          flowType: 'pkce',
          detectSessionInUrl: false,
          persistSession: true,
          autoRefreshToken: true,
          storageKey,
          storage: SecureStorage
        }
      });
      client.auth.onAuthStateChange((_, next) => {
        const changed = (session?.user?.id ?? null) !== (next?.user?.id ?? null);
        session = next;
        if (changed && ready) queueMicrotask(notify);
      });
      await App.addListener('appUrlOpen', ({url}) => complete(url));
      await App.addListener('appStateChange', ({isActive}) => {
        if (isActive) void client.auth.startAutoRefresh();
        else void client.auth.stopAutoRefresh();
      });
      await Browser.addListener('browserFinished', () => {
        if (pending && !completing) {
          pending = false;
          notify();
        }
      });
      const initial = await client.auth.getSession();
      if (initial.error) throw initial.error;
      session = initial.data.session;
      const launch = await App.getLaunchUrl();
      if (launch?.url) await complete(launch.url);
    } catch {
      error = '로그인 상태를 불러오지 못했어요. 앱을 다시 열어 주세요.';
    } finally {
      ready = true;
      notify();
    }
  }

  async function complete(url) {
    const result = readOAuthCallback(url);
    if (!result || completing || !client) return;
    completing = true;
    try {
      const attempt = Number(await SecureStorage.getItem(attemptKey));
      if (!attempt || Date.now() - attempt > attemptTimeout) return;
      if (result.error) {
        error = '로그인이 취소되었거나 연결할 수 없어요.';
        return;
      }
      const exchanged = await client.auth.exchangeCodeForSession(result.code);
      if (exchanged.error || !exchanged.data.session) throw exchanged.error ?? new Error();
      session = exchanged.data.session;
      error = '';
    } catch {
      error = '로그인을 완료하지 못했어요. 다시 시도해 주세요.';
    } finally {
      try { await SecureStorage.removeItem(attemptKey); } catch {}
      try { await Browser.close(); } catch {}
      completing = false;
      pending = false;
      notify();
    }
  }

  async function signIn(provider) {
    await initialized;
    if (!client || !providers.has(provider) || pending || completing) return;
    error = '';
    pending = true;
    notify();
    try {
      const result = await client.auth.signInWithOAuth({
        provider,
        options: {redirectTo: callbackUrl, skipBrowserRedirect: true}
      });
      if (result.error || !result.data.url || new URL(result.data.url).origin !== config.authUrl) throw result.error ?? new Error();
      await SecureStorage.setItem(attemptKey, String(Date.now()));
      await Browser.open({url: result.data.url});
    } catch {
      try { await SecureStorage.removeItem(attemptKey); } catch {}
      pending = false;
      error = '로그인 화면을 열지 못했어요. 다시 시도해 주세요.';
      notify();
    }
  }

  async function signOut() {
    if (!client) return;
    const result = await client.auth.signOut({scope: 'local'});
    if (result.error) throw new Error('로그아웃하지 못했어요. 다시 시도해 주세요.');
    session = null;
    error = '';
    notify();
  }

  async function fetchMates(route, init, expectedAccount) {
    if (!/^api\/mates\/[a-z]+(?:\?.*)?$/.test(route)) throw new Error('메이트 API 경로를 확인해 주세요.');
    await initialized;
    const current = await client?.auth.getSession();
    if (current?.error || !current?.data.session) throw new Error('메이트를 보려면 로그인해 주세요.');
    const account = current.data.session.user.id;
    if (account !== expectedAccount || account !== session?.user?.id) throw new Error('로그인 계정이 변경되었어요.');
    const headers = new Headers(init.headers);
    headers.set('Authorization', 'Bearer ' + current.data.session.access_token);
    const request = await fetch(config.apiUrl + '/' + route, {...init, headers, credentials: 'omit', redirect: 'error'});
    if (session?.user?.id !== account) throw new Error('로그인 계정이 변경되었어요.');
    return request;
  }

  return {state, signIn, signOut, fetchMates, subscribe: listener => { listeners.add(listener); }};
}
