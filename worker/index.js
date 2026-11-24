const photoLimit = 900_000;
const goalPattern = /^(core|[0-7]:(main|[0-7]))$/;
const codePattern = /^[A-F0-9]{14}$/;
const cheerOptions = new Set(['heart', 'clap', 'fire']);

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function json(body, status = 200) {
  return Response.json(body, {status, headers: {'Cache-Control': 'no-store'}});
}

async function readJson(request, limit = 40_000) {
  if (!request.headers.get('content-type')?.startsWith('application/json') ||
      (!mobileApi && ['cross-site', 'same-site'].includes(request.headers.get('sec-fetch-site')))) {
    throw new ApiError(415, '지원하는 요청 형식이 아니에요.');
  }
  if (!request.body || Number(request.headers.get('content-length')) > limit) {
    throw new ApiError(413, '보내는 데이터가 너무 커요.');
  }
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = '';
  for (;;) {
    const next = await reader.read();
    if (next.done) break;
    bytes += next.value.byteLength;
    if (bytes > limit) {
      await reader.cancel();
      throw new ApiError(413, '보내는 데이터가 너무 커요.');
    }
    text += decoder.decode(next.value, {stream: true});
  }
  try {
    const data = JSON.parse(text + decoder.decode());
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error();
    return data;
  } catch {
    throw new ApiError(400, '보내는 데이터를 확인해 주세요.');
  }
}

function statement(db, sql, ...values) {
  return db.prepare(sql).bind(...values);
}

async function rows(db, sql, ...values) {
  return (await statement(db, sql, ...values).all()).results;
}

function profileByCode(db, code) {
  if (typeof code !== 'string' || !codePattern.test(code)) throw new ApiError(400, '메이트 코드를 확인해 주세요.');
  return statement(db, 'SELECT id, code, name FROM mate_profiles WHERE code = ?', code).first();
}

async function ensureProfile(db, id) {
  const old = await statement(db, 'SELECT code, name FROM mate_profiles WHERE id = ?', id).first();
  if (old) return old;
  const code = crypto.randomUUID().replaceAll('-', '').slice(0, 14).toUpperCase();
  await statement(db, 'INSERT INTO mate_profiles (id, code, name) VALUES (?, ?, ?) ON CONFLICT(id) DO NOTHING',
    id, code, '메이트 ' + code.slice(-4)).run();
  return statement(db, 'SELECT code, name FROM mate_profiles WHERE id = ?', id).first();
}

function sortedPair(a, b) {
  return a < b ? [a, b] : [b, a];
}

async function accepted(db, a, b) {
  const [low, high] = sortedPair(a, b);
  return statement(db, 'SELECT 1 AS ok FROM mate_links WHERE low = ? AND high = ? AND status = ?',
    low, high, 'accepted').first();
}

async function findMate(db, user, code) {
  const peer = await profileByCode(db, code);
  if (!peer || !await accepted(db, user, peer.id)) throw new ApiError(404, '연결된 메이트를 찾을 수 없어요.');
  return peer;
}

async function state(db, user) {
  const profile = await ensureProfile(db, user);
  const [connections, selected, posts, received] = await Promise.all([
    rows(db, 'SELECT p.code, p.name, l.status, l.requester = ? AS outgoing FROM mate_links l ' +
      'JOIN mate_profiles p ON p.id = CASE WHEN l.low = ? THEN l.high ELSE l.low END WHERE l.low = ? OR l.high = ? ' +
      'ORDER BY p.name, p.code', user, user, user, user),
    rows(db, 'SELECT p.code, s.goal_id AS id, s.allow_photo AS allowPhoto FROM mate_posts s ' +
      'JOIN mate_profiles p ON p.id = s.receiver WHERE s.owner = ?', user),
    rows(db, 'SELECT p.code, p.name, s.goal_id AS id, s.title, s.area, s.tint, s.done_at AS doneAt, s.updated_at AS updatedAt, ' +
      's.allow_photo * s.has_photo AS hasPhoto, s.cheer FROM mate_posts s JOIN mate_profiles p ON p.id = s.owner ' +
      'WHERE s.receiver = ? ORDER BY COALESCE(s.done_at, s.updated_at) DESC, s.goal_id LIMIT 160', user),
    rows(db, 'SELECT p.code, p.name, s.title, s.cheer FROM mate_posts s JOIN mate_profiles p ON p.id = s.receiver ' +
      'WHERE s.owner = ? AND s.cheer IS NOT NULL ORDER BY s.updated_at DESC LIMIT 20', user)
  ]);
  return {profile, connections, selected, posts, received};
}

function validateGoal(value) {
  if (!value || typeof value.id !== 'string' || !goalPattern.test(value.id) ||
      typeof value.title !== 'string' || !value.title.trim() || value.title.length > 48 ||
      typeof value.area !== 'string' || value.area.length > 48 ||
      !Number.isInteger(value.tint) || value.tint < 0 || value.tint > 8 ||
      (value.doneAt !== null && (typeof value.doneAt !== 'string' || value.doneAt.length > 32 ||
        !Number.isFinite(Date.parse(value.doneAt))))) {
    throw new ApiError(400, '공개할 목표를 확인해 주세요.');
  }
  return value;
}

function photoKey(user, goal) {
  return 'goal-photos/' + encodeURIComponent(user) + '/' + goal + '.jpg';
}

async function storePhoto(env, user, request) {
  const {id, data} = await readJson(request, photoLimit + 200);
  if (typeof id !== 'string' || !goalPattern.test(id) || typeof data !== 'string' ||
      data.length > photoLimit || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(data)) {
    throw new ApiError(400, 'JPG 사진만 메이트에게 공개할 수 있어요.');
  }
  const bytes = Uint8Array.from(atob(data.slice(data.indexOf(',') + 1)), code => code.charCodeAt(0));
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new ApiError(400, '사진을 읽을 수 없어요.');
  await env.BUCKET.put(photoKey(user, id), bytes, {httpMetadata: {contentType: 'image/jpeg'}});
}

async function mateBoard(db, user, url) {
  const peer = await findMate(db, user, url.searchParams.get('code'));
  const posts = await rows(db, 'SELECT goal_id AS id, title, area, tint, done_at AS doneAt, updated_at AS updatedAt, ' +
    'allow_photo * has_photo AS hasPhoto FROM mate_posts WHERE owner = ? AND receiver = ? ' +
    'AND EXISTS (SELECT 1 FROM mate_links WHERE low = ? AND high = ? AND status = ?) ORDER BY goal_id',
    peer.id, user, ...sortedPair(user, peer.id), 'accepted');
  return {name: peer.name, posts};
}

async function receivePhoto(env, user, url) {
  const owner = await findMate(env.DB, user, url.searchParams.get('code'));
  const id = url.searchParams.get('id');
  const permission = await statement(env.DB, 'SELECT 1 AS ok FROM mate_posts WHERE owner = ? AND receiver = ? ' +
    'AND goal_id = ? AND allow_photo = 1 AND has_photo = 1', owner.id, user, id).first();
  if (!permission) throw new ApiError(404, '공개된 사진이 없어요.');
  const object = await env.BUCKET.get(photoKey(owner.id, id));
  if (!object) throw new ApiError(404, '사진을 찾을 수 없어요.');
  return new Response(object.body, {headers: {'Content-Type': 'image/jpeg',
    'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff'}});
}

async function sharing(db, user, data) {
  const peer = await findMate(db, user, data.code);
  if (!Array.isArray(data.goals) || data.goals.length > 73) throw new ApiError(400, '선택한 목표를 확인해 주세요.');
  const goals = data.goals.map(validateGoal);
  if (new Set(goals.map(goal => goal.id)).size !== goals.length) throw new ApiError(400, '목표가 중복되었어요.');
  const encoded = JSON.stringify(goals.map(goal => ({...goal,
    allowPhoto: Number(goal.allowPhoto === true), hasPhoto: Number(goal.hasPhoto === true)})));
  const remove = statement(db, 'DELETE FROM mate_posts WHERE owner = ? AND receiver = ? ' +
    'AND goal_id NOT IN (SELECT json_extract(value, ?) FROM json_each(?))', user, peer.id, '$.id', encoded);
  const upsert = statement(db, 'INSERT INTO mate_posts (owner, receiver, goal_id, title, area, tint, done_at, ' +
    'allow_photo, has_photo, updated_at) SELECT ?, ?, json_extract(value, ?), json_extract(value, ?), json_extract(value, ?), ' +
    'json_extract(value, ?), json_extract(value, ?), json_extract(value, ?), json_extract(value, ?), ? FROM json_each(?) ' +
    'WHERE EXISTS (SELECT 1 FROM mate_links WHERE low = ? AND high = ? AND status = ?) ' +
    'ON CONFLICT(owner, receiver, goal_id) DO UPDATE SET title = excluded.title, area = excluded.area, tint = excluded.tint, ' +
    'done_at = excluded.done_at, allow_photo = excluded.allow_photo, has_photo = excluded.has_photo, updated_at = excluded.updated_at',
    user, peer.id, '$.id', '$.title', '$.area', '$.tint', '$.doneAt', '$.allowPhoto', '$.hasPhoto',
    new Date().toISOString(), encoded, ...sortedPair(user, peer.id), 'accepted');
  await db.batch([remove, upsert]);
}

async function updateGoal(db, user, data) {
  if (!data.goal) {
    if (!goalPattern.test(data.id ?? '')) throw new ApiError(400, '목표를 확인해 주세요.');
    await statement(db, 'DELETE FROM mate_posts WHERE owner = ? AND goal_id = ?', user, data.id).run();
    return;
  }
  const goal = validateGoal(data.goal);
  await statement(db, 'UPDATE mate_posts SET title = ?, area = ?, tint = ?, done_at = ?, has_photo = ?, updated_at = ? ' +
    'WHERE owner = ? AND goal_id = ?', goal.title, goal.area, goal.tint, goal.doneAt, Number(goal.hasPhoto === true),
    new Date().toISOString(), user, goal.id).run();
}

const nativeOrigins = new Set(['capacitor://localhost', 'https://localhost']);

async function mobileUser(request, env) {
  const auth = request.headers.get('authorization') ?? '';
  if (auth.length > 8192 || !/^Bearer [A-Za-z0-9_-]+[.][A-Za-z0-9_-]+[.][A-Za-z0-9_-]+$/.test(auth)) {
    throw new ApiError(401, '메이트를 보려면 로그인해 주세요.');
  }
  const base = env.SUPABASE_URL;
  const key = env.SUPABASE_PUBLISHABLE_KEY;
  let config;
  try { config = new URL(base); } catch { throw new ApiError(503, '로그인 서버 설정이 필요해요.'); }
  if (config.protocol !== 'https:' || config.origin !== base || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(key ?? '')) {
    throw new ApiError(503, '로그인 서버 설정이 필요해요.');
  }
  let response;
  try {
    response = await fetch(config.origin + '/auth/v1/user', {
      headers: {Authorization: auth, apikey: key},
      redirect: 'error',
      signal: AbortSignal.timeout(8000)
    });
  } catch {
    throw new ApiError(503, '로그인 서버에 연결할 수 없어요.');
  }
  if (response.status === 400 || response.status === 401 || response.status === 403) {
    throw new ApiError(401, '다시 로그인해 주세요.');
  }
  if (!response.ok) throw new ApiError(503, '로그인 서버에 연결할 수 없어요.');
  const profile = await response.json().catch(() => null);
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(profile?.id ?? '')) {
    throw new ApiError(401, '로그인 계정을 확인할 수 없어요.');
  }
  return 'mobile:' + profile.id.toLowerCase();
}

function crossOrigin(response, origin) {
  if (!origin) return response;
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Vary', 'Origin');
  return new Response(response.body, {status: response.status, headers});
}

async function matesApi(request, env, url) {
  const user = mobileApi ? await mobileUser(request, env) : request.headers.get('oai-authenticated-user-id');
  if (!user) throw new ApiError(401, '메이트 탭을 이용하려면 로그인해 주세요.');
  if (!env.DB || !env.BUCKET) throw new ApiError(503, '메이트 서버를 준비하고 있어요.');
  const db = env.DB;
  const route = url.pathname.slice('/api/mates/'.length);
  if (request.method === 'GET') {
    if (route === 'state') return json(await state(db, user));
    if (route === 'board') return json(await mateBoard(db, user, url));
    if (route === 'photo') return receivePhoto(env, user, url);
  }
  if (request.method === 'PUT' && route === 'photo') {
    await storePhoto(env, user, request);
    return json({ok: true});
  }
  if (request.method !== 'PUT') throw new ApiError(404, '요청한 기능을 찾을 수 없어요.');
  const data = await readJson(request);
  if (route === 'sharing') {
    await sharing(db, user, data);
  } else if (route === 'goal') {
    await updateGoal(db, user, data);
  } else if (route === 'profile') {
    if (typeof data.name !== 'string' || !data.name.trim() || data.name.trim().length > 20) {
      throw new ApiError(400, '닉네임을 1~20자로 입력해 주세요.');
    }
    await ensureProfile(db, user);
    await statement(db, 'UPDATE mate_profiles SET name = ? WHERE id = ?', data.name.trim(), user).run();
  } else if (route === 'request') {
    await ensureProfile(db, user);
    const peer = await profileByCode(db, data.code);
    if (!peer) throw new ApiError(404, '메이트 코드를 찾을 수 없어요.');
    if (peer.id === user) throw new ApiError(400, '내 코드는 등록할 수 없어요.');
    await statement(db, 'INSERT INTO mate_links (low, high, requester, status) VALUES (?, ?, ?, ?) ' +
      'ON CONFLICT(low, high) DO NOTHING', ...sortedPair(user, peer.id), user, 'pending').run();
  } else if (route === 'respond' || route === 'remove') {
    const peer = await profileByCode(db, data.code);
    if (!peer) throw new ApiError(404, '메이트를 찾을 수 없어요.');
    const pair = sortedPair(user, peer.id);
    if (route === 'remove') {
      await db.batch([
        statement(db, 'DELETE FROM mate_links WHERE low = ? AND high = ?', ...pair),
        statement(db, 'DELETE FROM mate_posts WHERE (owner = ? AND receiver = ?) OR (owner = ? AND receiver = ?)',
          user, peer.id, peer.id, user)
      ]);
    } else if (data.accept === true) {
      await statement(db, 'UPDATE mate_links SET status = ? WHERE low = ? AND high = ? AND requester = ? AND status = ?',
        'accepted', ...pair, peer.id, 'pending').run();
    } else {
      await statement(db, 'DELETE FROM mate_links WHERE low = ? AND high = ? AND requester = ? AND status = ?',
        ...pair, peer.id, 'pending').run();
    }
  } else if (route === 'cheer') {
    const peer = await findMate(db, user, data.code);
    if (!goalPattern.test(data.id ?? '') || (data.cheer !== null && !cheerOptions.has(data.cheer))) {
      throw new ApiError(400, '응원을 확인해 주세요.');
    }
    await statement(db, 'UPDATE mate_posts SET cheer = ? WHERE owner = ? AND receiver = ? AND goal_id = ?',
      data.cheer, peer.id, user, data.id).run();
  } else {
    throw new ApiError(404, '요청한 기능을 찾을 수 없어요.');
  }
  return json({ok: true});
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/mates/')) {
      const origin = mobileApi ? request.headers.get('origin') : null;
      if (origin && !nativeOrigins.has(origin)) return json({error: '지원하는 앱에서 열어 주세요.'}, 403);
      if (mobileApi && request.method === 'OPTIONS') {
        if (!origin) return json({error: '지원하는 앱에서 열어 주세요.'}, 403);
        return crossOrigin(new Response(null, {status: 204, headers: {
          'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
          'Access-Control-Allow-Headers': 'Authorization, Content-Type',
          'Access-Control-Max-Age': '600'
        }}), origin);
      }
      try {
        return crossOrigin(await matesApi(request, env, url), origin);
      } catch (error) {
        if (error instanceof ApiError) return crossOrigin(json({error: error.message}, error.status), origin);
        console.error('Mates API:', error.message);
        return crossOrigin(json({error: '메이트 기능을 연결하지 못했어요. 잠시 후 다시 시도해 주세요.'}, 500), origin);
      }
    }
    const path = url.pathname === '/' ? '/index.html' : url.pathname;
    const asset = Object.hasOwn(assets, path) ? assets[path] : null;
    if (!asset || !['HEAD', 'GET'].includes(request.method)) return new Response('Not found', {status: 404});
    const body = request.method === 'HEAD' ? null : Uint8Array.from(atob(asset.data), char => char.charCodeAt(0));
    return new Response(body, {headers: {'Content-Type': asset.type, 'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff'}});
  }
};
