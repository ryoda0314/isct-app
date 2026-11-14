// キャリアの掲載のために外部のページを取りに行く（応募先リンクの確認・URL からの下書き）。
//
// 取りに行く URL は管理者が入れたもの（と、その掲載）だけ。それでも次を守る:
// - http/https・既定のポートだけ。社内・ループバック・リンクローカルなどのアドレスに解決されるホストは拒否
//   （リダイレクト先も毎回確かめる）。解決と接続の間の DNS の入れ替えまでは防げないので、管理者用の機能に限る。
// - タイムアウトと読み込むサイズに上限を設ける。
// - robots.txt が禁止しているパスは読まない（下書き・リンク確認とも）。
// - 名乗る User-Agent に掲載方針のページを書く。
import dns from 'node:dns/promises';
import net from 'node:net';

export const BOT_UA = 'ScienceTokyoAppBot/1.0 (+https://sciencetokyo.app/career-policy)';
const BOT_TOKEN = 'sciencetokyoappbot';

function privateV4(ip) {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => !(n >= 0 && n <= 255))) return true;
  const [a, b] = p;
  return a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 192 && b === 0)
    || (a === 198 && (b === 18 || b === 19));
}

function privateIp(ip) {
  if (net.isIPv4(ip)) return privateV4(ip);
  const s = ip.toLowerCase();
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (mapped) return privateV4(mapped[1]);
  return s === '::' || s === '::1' || s.startsWith('fc') || s.startsWith('fd') || s.startsWith('fe8') || s.startsWith('fe9') || s.startsWith('fea') || s.startsWith('feb') || s.startsWith('ff');
}

export async function assertPublicUrl(raw) {
  const u = new URL(raw);
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('http/https だけ取得できます');
  if (u.username || u.password) throw new Error('認証情報つきの URL は取得しません');
  if (u.port && !['80', '443'].includes(u.port)) throw new Error('既定以外のポートは取得しません');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (/^(localhost|.*\.local|.*\.internal)$/i.test(host)) throw new Error('社内向けのホストは取得しません');
  const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true });
  if (!addrs.length || addrs.some((a) => privateIp(a.address))) throw new Error('社内向けのアドレスは取得しません');
  return u;
}

function decode(buf, contentType) {
  let cs = (/charset=([\w-]+)/i.exec(contentType || '') || [])[1];
  if (!cs) {
    const head = buf.subarray(0, 4096).toString('latin1');
    cs = (/<meta[^>]+charset=["']?([\w-]+)/i.exec(head) || [])[1];
  }
  try { return new TextDecoder((cs || 'utf-8').toLowerCase()).decode(buf); }
  catch { return new TextDecoder('utf-8').decode(buf); }
}

/**
 * 外部のページを取得する。{ status, url（最終）, text?, contentType }。
 * method: HEAD のときは本文を読まない。リダイレクトは自分でたどり、行き先も毎回確かめる。
 */
export async function safeFetch(url, { method = 'GET', timeoutMs = 10000, maxBytes = 1_500_000, redirects = 4 } = {}) {
  let cur = url;
  for (let i = 0; i <= redirects; i++) {
    await assertPublicUrl(cur);
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(cur, {
        method, redirect: 'manual', signal: ctrl.signal,
        headers: { 'User-Agent': BOT_UA, Accept: method === 'HEAD' ? '*/*' : 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5', 'Accept-Language': 'ja,en;q=0.7' },
      });
      const loc = res.headers.get('location');
      if (res.status >= 300 && res.status < 400 && loc) {
        try { await res.body?.cancel(); } catch { /* 読まない */ }
        cur = new URL(loc, cur).toString();
        continue;
      }
      const contentType = res.headers.get('content-type') || '';
      if (method === 'HEAD' || !res.body) return { status: res.status, url: cur, text: null, contentType };
      const reader = res.body.getReader();
      const chunks = [];
      let size = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > maxBytes) { try { await reader.cancel(); } catch { /* 上限で打ち切り */ } break; }
        chunks.push(value);
      }
      return { status: res.status, url: cur, text: decode(Buffer.concat(chunks.map((c) => Buffer.from(c))), contentType), contentType };
    } finally {
      clearTimeout(tid);
    }
  }
  throw new Error('リダイレクトが多すぎます');
}

// robots.txt の読み取り（グループ: 自分の名前か * ／ 最長一致の Allow / Disallow。* と $ に対応）
const robotsCache = new Map(); // origin -> { at, rules | 'all-disallowed' | null }

function parseRobots(txt) {
  const groups = [];
  let cur = null, lastWasAgent = false;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const m = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase(), val = m[2].trim();
    if (key === 'user-agent') {
      if (!lastWasAgent || !cur) { cur = { agents: [], rules: [] }; groups.push(cur); }
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (cur && (key === 'allow' || key === 'disallow')) cur.rules.push({ allow: key === 'allow', path: val });
    }
  }
  const mine = groups.filter((g) => g.agents.some((a) => a && a !== '*' && BOT_TOKEN.includes(a)));
  const chosen = mine.length ? mine : groups.filter((g) => g.agents.includes('*'));
  return chosen.flatMap((g) => g.rules).filter((r) => r.path !== '' || !r.allow);
}

function ruleMatches(rulePath, path) {
  if (rulePath === '') return false; // 空の Disallow = すべて許可
  const re = new RegExp('^' + rulePath.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*').replace(/\\\$$/, '$'));
  return re.test(path);
}

/** その URL を読んでよいか（robots.txt）。5xx・取得失敗は「読まない」側に倒す。4xx（無い）は許可 */
export async function robotsAllows(rawUrl) {
  const u = new URL(rawUrl);
  const hit = robotsCache.get(u.origin);
  let rules;
  if (hit && Date.now() - hit.at < 6 * 3600e3) rules = hit.rules;
  else {
    try {
      const r = await safeFetch(`${u.origin}/robots.txt`, { timeoutMs: 6000, maxBytes: 300_000 });
      rules = r.status >= 500 ? 'all-disallowed' : r.status >= 400 ? [] : parseRobots(r.text || '');
    } catch { rules = 'all-disallowed'; }
    robotsCache.set(u.origin, { at: Date.now(), rules });
  }
  if (rules === 'all-disallowed') return false;
  const path = u.pathname + u.search;
  let best = null;
  for (const r of rules) {
    if (!ruleMatches(r.path, path)) continue;
    if (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow)) best = r;
  }
  return !best || best.allow;
}

export const _test = { parseRobots, ruleMatches, privateIp };
