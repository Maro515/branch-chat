// BranCHAT Web 版のサーバー（Cloudflare Workers）。画面（dist/）は静的配信、/api/* だけここで処理する。
// ログインは Cloudflare Access（許可したメールアドレスだけ）。Access が付ける JWT（Cf-Access-Jwt-Assertion）を検証し、メールアドレスごとに保存先を分ける。
// 会話は R2 に 1 会話 1 ファイル（JSON）、一覧・版・画像の索引は D1。上書きの前の版を残す（10 分に 1 版、1 会話 30 版まで。食い違ったときは必ず残す）。
// 秘密（API キー）はここに来ない。中身の暗号化はしていない（利用上の注意に明記）。
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const KV_NAMES = ['settings', 'links'];
const REV_EVERY_MS = 10 * 60 * 1000;
const REV_KEEP = 30;
const CONV_MAX = 20 * 1024 * 1024;
const IMG_MAX = 30 * 1024 * 1024;
const KV_MAX = 2 * 1024 * 1024;

// 画面に付けるセキュリティのヘッダー（AI の API と、決まった LLM の接続先にだけ通信できる。キーを他所へ送られないように）
const CONNECT = ["'self'", 'https://api.anthropic.com', 'https://api.openai.com', 'https://generativelanguage.googleapis.com', 'https://api.x.ai', 'https://api.deepseek.com', 'https://api.mistral.ai', 'https://api.groq.com', 'https://openrouter.ai', 'http://localhost:11434', 'http://localhost:1234'];
const CSP = ["default-src 'self'", "script-src 'self' 'unsafe-inline'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:", "font-src 'self' data:", 'connect-src ' + CONNECT.join(' '), "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'", "worker-src 'self' blob:"].join('; ');

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/api/')) {
      try { return await api(req, env, url); } catch (e) { return json({ error: 'サーバーで失敗しました' }, 500); }
    }
    const res = await env.ASSETS.fetch(req);
    const h = new Headers(res.headers);
    h.set('Content-Security-Policy', CSP); h.set('X-Content-Type-Options', 'nosniff'); h.set('Referrer-Policy', 'no-referrer'); h.set('X-Frame-Options', 'DENY');
    h.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if ((h.get('Content-Type') || '').includes('text/html')) h.set('Cache-Control', 'no-cache');
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
  }
};

const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const err = (m, status = 400) => json({ error: m }, status);

/* ---------- ログインした人 ---------- */
let certCache = { at: 0, keys: null };
const b64u = (s) => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; const bin = atob(s); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a; };
async function accessKeys(team) {
  if (certCache.keys && Date.now() - certCache.at < 3600e3) return certCache.keys;
  const r = await fetch(`https://${team}/cdn-cgi/access/certs`); if (!r.ok) throw new Error('certs');
  const j = await r.json(); certCache = { at: Date.now(), keys: j.keys || [] }; return certCache.keys;
}
async function verifyAccess(jwt, env) {
  const parts = String(jwt || '').split('.'); if (parts.length !== 3) return null;
  const head = JSON.parse(new TextDecoder().decode(b64u(parts[0]))); const body = JSON.parse(new TextDecoder().decode(b64u(parts[1])));
  const team = env.ACCESS_TEAM_DOMAIN.replace(/^https?:\/\//, '').replace(/\/$/, '');
  let keys = await accessKeys(team); let jwk = keys.find((k) => k.kid === head.kid);
  if (!jwk) { certCache.at = 0; keys = await accessKeys(team); jwk = keys.find((k) => k.kid === head.kid); } // 鍵の入れ替え直後
  if (!jwk || head.alg !== 'RS256') return null;
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64u(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1]));
  if (!ok) return null;
  const now = Math.floor(Date.now() / 1000);
  if (body.exp && now > body.exp + 30) return null; if (body.nbf && now + 30 < body.nbf) return null;
  const aud = Array.isArray(body.aud) ? body.aud : [body.aud]; if (!aud.includes(env.ACCESS_AUD)) return null;
  if (body.iss && body.iss !== `https://${team}`) return null;
  return body;
}
async function currentEmail(req, env, url) {
  if (env.ACCESS_AUD && env.ACCESS_TEAM_DOMAIN) { const p = await verifyAccess(req.headers.get('Cf-Access-Jwt-Assertion'), env).catch(() => null); return p && p.email ? String(p.email).toLowerCase() : null; }
  // 手元の確認（wrangler dev）だけ: .dev.vars の DEV_USER_EMAIL。本番は ACCESS_* が無ければ誰も入れない
  if (env.DEV_USER_EMAIL && ['localhost', '127.0.0.1'].includes(url.hostname)) return String(env.DEV_USER_EMAIL).toLowerCase();
  return null;
}
async function uidOf(email) { const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('branchat:' + email)); return [...new Uint8Array(d)].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join(''); }

/* ---------- 使用量 ---------- */
async function usage(env, uid) {
  const q = (sql) => env.DB.prepare(sql).bind(uid).first();
  const a = await q('SELECT COALESCE(SUM(size),0) AS s FROM convs WHERE uid=? AND deleted=0');
  const b = await q('SELECT COALESCE(SUM(size),0) AS s FROM revs WHERE uid=?');
  const c = await q('SELECT COALESCE(SUM(size),0) AS s FROM imgs WHERE uid=?');
  const d = await q('SELECT COALESCE(SUM(size),0) AS s FROM kv WHERE uid=?');
  return (a.s || 0) + (b.s || 0) + (c.s || 0) + (d.s || 0);
}
const quotaOf = (env) => (Number(env.QUOTA_MB) > 0 ? Number(env.QUOTA_MB) : 1024) * 1024 * 1024;

/* ---------- 版 ---------- */
async function snapshot(env, uid, id, force) {
  const cur = await env.DB.prepare('SELECT title,updated_at,size FROM convs WHERE uid=? AND id=? AND deleted=0').bind(uid, id).first(); if (!cur) return;
  const last = await env.DB.prepare('SELECT MAX(rev) AS rev, MAX(saved_at) AS at FROM revs WHERE uid=? AND id=?').bind(uid, id).first();
  if (!force && last && last.at && Date.now() - last.at < REV_EVERY_MS) return;
  const obj = await env.R2.get(`${uid}/c/${id}.json`); if (!obj) return;
  const rev = ((last && last.rev) || 0) + 1; const text = await obj.text();
  await env.R2.put(`${uid}/r/${id}/${rev}.json`, text, { httpMetadata: { contentType: 'application/json' } });
  await env.DB.prepare('INSERT INTO revs(uid,id,rev,saved_at,size,title) VALUES(?,?,?,?,?,?)').bind(uid, id, rev, cur.updated_at || Date.now(), text.length, cur.title || '').run();
  const old = await env.DB.prepare('SELECT rev FROM revs WHERE uid=? AND id=? ORDER BY rev DESC LIMIT -1 OFFSET ?').bind(uid, id, REV_KEEP).all();
  for (const r of old.results || []) { await env.R2.delete(`${uid}/r/${id}/${r.rev}.json`); await env.DB.prepare('DELETE FROM revs WHERE uid=? AND id=? AND rev=?').bind(uid, id, r.rev).run(); }
}

/* ---------- /api ---------- */
async function api(req, env, url) {
  const email = await currentEmail(req, env, url);
  if (!email) return err('ログインが必要です', 401);
  if (env.ALLOWED_EMAILS) { const allow = String(env.ALLOWED_EMAILS).toLowerCase().split(/[\s,]+/).filter(Boolean); if (!allow.includes(email)) return err('この Web 版を使う許可がありません', 403); }
  const m = req.method;
  if (m !== 'GET') { // ほかのサイトから書き換えさせない（独自のヘッダーが要る＝別のサイトからは送れない。Origin も確かめる）
    if (req.headers.get('X-BranCHAT') !== '1') return err('不正な要求です', 403);
    const o = req.headers.get('Origin'); if (o && o !== url.origin) return err('不正な要求です', 403);
  }
  const uid = await uidOf(email);
  const p = url.pathname.replace(/^\/api\//, '').split('/').map(decodeURIComponent);
  const now = Date.now();

  if (p[0] === 'me' && m === 'GET') {
    await env.DB.prepare('INSERT INTO users(uid,email,created_at,last_seen) VALUES(?,?,?,?) ON CONFLICT(uid) DO UPDATE SET last_seen=excluded.last_seen, email=excluded.email').bind(uid, email, now, now).run();
    const u = await env.DB.prepare('SELECT terms_ver FROM users WHERE uid=?').bind(uid).first();
    return json({ email, termsVer: (u && u.terms_ver) || 0, usage: { bytes: await usage(env, uid), quota: quotaOf(env) } });
  }
  if (p[0] === 'consent' && m === 'POST') {
    const b = await req.json().catch(() => ({})); const ver = Number(b.ver) || 0; if (!ver) return err('版がありません');
    await env.DB.prepare('UPDATE users SET terms_ver=?, terms_at=? WHERE uid=?').bind(ver, now, uid).run();
    return json({ ok: true });
  }

  if (p[0] === 'convs') {
    if (p.length === 1 && m === 'GET') {
      const r = await env.DB.prepare('SELECT id,title,updated_at,size,deleted FROM convs WHERE uid=?').bind(uid).all();
      return json({ convs: (r.results || []).map((x) => ({ id: x.id, title: x.title, updatedAt: x.updated_at, size: x.size, deleted: !!x.deleted })) });
    }
    const id = p[1]; if (!ID_RE.test(id || '')) return err('会話の id が正しくありません');
    if (p.length === 2 && m === 'GET') {
      const o = await env.R2.get(`${uid}/c/${id}.json`); if (!o) return err('ありません', 404);
      return new Response(o.body, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
    }
    if (p.length === 2 && m === 'PUT') {
      const len = Number(req.headers.get('Content-Length') || 0); if (len > CONV_MAX) return err('会話が大きすぎます（20 MB まで）', 413);
      const text = await req.text(); if (text.length > CONV_MAX) return err('会話が大きすぎます（20 MB まで）', 413);
      let b; try { b = JSON.parse(text); } catch (e) { return err('内容を読めませんでした'); }
      const c = b && b.conv; if (!c || typeof c !== 'object' || c.id !== id) return err('会話の形が正しくありません');
      const body = JSON.stringify(c); const at = Number(b.updatedAt) || now;
      const cur = await env.DB.prepare('SELECT updated_at,size FROM convs WHERE uid=? AND id=? AND deleted=0').bind(uid, id).first();
      if ((await usage(env, uid)) - ((cur && cur.size) || 0) + body.length > quotaOf(env)) return err('容量の上限に達しました（不要な会話や画像を消してください）', 413);
      if (cur) await snapshot(env, uid, id, cur.updated_at > at); // サーバーの方が新しいのに上書きされるときは、必ず前の版を残す
      await env.R2.put(`${uid}/c/${id}.json`, body, { httpMetadata: { contentType: 'application/json' } });
      await env.DB.prepare('INSERT INTO convs(uid,id,title,updated_at,size,deleted) VALUES(?,?,?,?,?,0) ON CONFLICT(uid,id) DO UPDATE SET title=excluded.title, updated_at=excluded.updated_at, size=excluded.size, deleted=0').bind(uid, id, String(c.title || '').slice(0, 200), at, body.length).run();
      return json({ ok: true, updatedAt: at });
    }
    if (p.length === 2 && m === 'DELETE') {
      await snapshot(env, uid, id, true); // 消す前の状態も版として残す（版の履歴から戻せる）
      await env.R2.delete(`${uid}/c/${id}.json`);
      await env.DB.prepare('INSERT INTO convs(uid,id,title,updated_at,size,deleted) VALUES(?,?,?,?,0,1) ON CONFLICT(uid,id) DO UPDATE SET updated_at=excluded.updated_at, size=0, deleted=1').bind(uid, id, '', now).run();
      return json({ ok: true });
    }
    if (p[2] === 'revs' && p.length === 3 && m === 'GET') {
      const r = await env.DB.prepare('SELECT rev,saved_at,size,title FROM revs WHERE uid=? AND id=? ORDER BY rev DESC').bind(uid, id).all();
      return json({ revs: (r.results || []).map((x) => ({ rev: x.rev, savedAt: x.saved_at, size: x.size, title: x.title })) });
    }
    if (p[2] === 'revs' && p.length === 4 && m === 'GET') {
      const rev = Number(p[3]); if (!Number.isInteger(rev) || rev < 1) return err('版の番号が正しくありません');
      const o = await env.R2.get(`${uid}/r/${id}/${rev}.json`); if (!o) return err('ありません', 404);
      return new Response(o.body, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
    }
    return err('ありません', 404);
  }

  if (p[0] === 'img' && p.length === 2) {
    const id = p[1]; if (!ID_RE.test(id || '')) return err('画像の id が正しくありません');
    if (m === 'GET') {
      const o = await env.R2.get(`${uid}/i/${id}`); if (!o) return err('ありません', 404);
      return new Response(o.body, { headers: { 'Content-Type': (o.httpMetadata && o.httpMetadata.contentType) || 'application/octet-stream', 'Cache-Control': 'private, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' } });
    }
    if (m === 'PUT') {
      const type = String(req.headers.get('Content-Type') || '').split(';')[0].trim();
      if (!/^image\/(png|jpeg|webp|gif)$/.test(type)) return err('この種類の画像は保存できません');
      const buf = await req.arrayBuffer(); if (buf.byteLength > IMG_MAX) return err('画像が大きすぎます（30 MB まで）', 413);
      const cur = await env.DB.prepare('SELECT size FROM imgs WHERE uid=? AND id=?').bind(uid, id).first();
      if ((await usage(env, uid)) - ((cur && cur.size) || 0) + buf.byteLength > quotaOf(env)) return err('容量の上限に達しました（不要な会話や画像を消してください）', 413);
      await env.R2.put(`${uid}/i/${id}`, buf, { httpMetadata: { contentType: type } });
      await env.DB.prepare('INSERT INTO imgs(uid,id,size,type,created_at) VALUES(?,?,?,?,?) ON CONFLICT(uid,id) DO UPDATE SET size=excluded.size, type=excluded.type').bind(uid, id, buf.byteLength, type, now).run();
      return json({ ok: true });
    }
  }

  if (p[0] === 'kv' && p.length === 2 && KV_NAMES.includes(p[1])) {
    const key = `${uid}/k/${p[1]}.json`;
    if (m === 'GET') { const o = await env.R2.get(key); return json({ data: o ? JSON.parse(await o.text()) : null }); }
    if (m === 'PUT') {
      const text = await req.text(); if (text.length > KV_MAX) return err('大きすぎます', 413);
      let b; try { b = JSON.parse(text); } catch (e) { return err('内容を読めませんでした'); }
      const body = JSON.stringify(b && b.data !== undefined ? b.data : null);
      await env.R2.put(key, body, { httpMetadata: { contentType: 'application/json' } });
      await env.DB.prepare('INSERT INTO kv(uid,name,updated_at,size) VALUES(?,?,?,?) ON CONFLICT(uid,name) DO UPDATE SET updated_at=excluded.updated_at, size=excluded.size').bind(uid, p[1], now, body.length).run();
      return json({ ok: true });
    }
  }

  if (p[0] === 'account' && p.length === 1 && m === 'DELETE') { // 本人がアカウントとデータを消す（R2 の中身と D1 の行をすべて）
    let cursor;
    do { const l = await env.R2.list({ prefix: uid + '/', cursor, limit: 1000 }); const keys = (l.objects || []).map((o) => o.key); if (keys.length) await env.R2.delete(keys); cursor = l.truncated ? l.cursor : undefined; } while (cursor);
    for (const t of ['convs', 'revs', 'imgs', 'kv', 'users']) await env.DB.prepare(`DELETE FROM ${t} WHERE uid=?`).bind(uid).run();
    return json({ ok: true });
  }

  return err('ありません', 404);
}
