// 管理画面の「URL から下書き」: 公式ページに埋め込まれた構造化データ（schema.org の JobPosting / Event、JSON-LD）から
// タイトル・組織名・締切などを拾い、掲載フォームの下書きにする。運営者が公式ページを見て確かめてから保存する前提。
// 要約は写さない（文章の転載をしない。運営者が事実だけを書く）。構造化データが無ければ og:title / <title> だけ。

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const unent = (s) => String(s || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
  if (e[0] === '#') { const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) ? String.fromCodePoint(n) : m; }
  return ENT[e.toLowerCase()] ?? m;
});
const txt = (v) => unent(String(v || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

function jsonLdNodes(html) {
  const out = [];
  for (const m of html.matchAll(/<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    const body = m[1].replace(/^\s*<!--/, '').replace(/-->\s*$/, '').replace(/^\s*\/\/<!\[CDATA\[/, '').replace(/\/\/\]\]>\s*$/, '').trim();
    let data;
    try { data = JSON.parse(body); } catch { continue; }
    const stack = [data];
    while (stack.length) {
      const n = stack.pop();
      if (Array.isArray(n)) { stack.push(...n); continue; }
      if (n && typeof n === 'object') {
        out.push(n);
        if (Array.isArray(n['@graph'])) stack.push(...n['@graph']);
      }
    }
  }
  return out;
}

const typeOf = (n) => [].concat(n['@type'] || []).map(String);
const nameOf = (v) => (typeof v === 'string' ? v : v && typeof v === 'object' ? (Array.isArray(v) ? nameOf(v[0]) : v.name) : '') || '';

// "2026-12-01" / "2026-12-01T23:59:00+09:00" → 日本時間の YYYY-MM-DD
function jstDate(v) {
  if (!v) return '';
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const t = Date.parse(s);
  return Number.isNaN(t) ? '' : new Date(t + 9 * 3600e3).toISOString().slice(0, 10);
}
const iso = (v) => { const t = Date.parse(String(v || '')); return Number.isNaN(t) ? '' : new Date(t).toISOString(); };

function placeOf(loc) {
  const l = Array.isArray(loc) ? loc[0] : loc;
  if (!l || typeof l !== 'object') return typeof l === 'string' ? l : '';
  const a = l.address && typeof l.address === 'object' ? l.address : {};
  return [l.name, a.addressRegion, a.addressLocality].filter(Boolean).map(txt).filter((x, i, arr) => arr.indexOf(x) === i).join(' ');
}

function salaryText(bs) {
  if (!bs || typeof bs !== 'object') return '';
  const v = bs.value && typeof bs.value === 'object' ? bs.value : bs;
  const unit = { HOUR: '時給', DAY: '日給', WEEK: '週給', MONTH: '月給', YEAR: '年収' }[String(v.unitText || '').toUpperCase()] || '';
  const fmt = (n) => (Number.isFinite(Number(n)) ? Number(n).toLocaleString('ja-JP') : '');
  const lo = fmt(v.minValue ?? v.value), hi = fmt(v.maxValue);
  if (!lo && !hi) return '';
  return `${unit}${lo}${hi && hi !== lo ? `〜${hi}` : ''}${(bs.currency || 'JPY') === 'JPY' ? '円' : ` ${bs.currency}`}（構造化データの記載）`;
}

function metaContent(html, prop) {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*>`, 'i');
  const tag = (re.exec(html) || [])[0];
  return tag ? txt((/content=["']([^"']*)["']/i.exec(tag) || [])[1]) : '';
}

/** HTML から下書きを作る。{ found: 'JobPosting' | 'Event' | 'meta' | null, draft } */
export function extractDraft(html) {
  const nodes = jsonLdNodes(html || '');
  const job = nodes.find((n) => typeOf(n).includes('JobPosting'));
  if (job) {
    const types = [].concat(job.employmentType || []).map((x) => String(x).toUpperCase());
    const remote = String(job.jobLocationType || '').toUpperCase() === 'TELECOMMUTE';
    return {
      found: 'JobPosting',
      draft: {
        kind: types.includes('INTERN') ? 'intern' : 'job',
        title: txt(job.title || job.name),
        org: txt(nameOf(job.hiringOrganization)),
        deadline: jstDate(job.validThrough),
        location: placeOf(job.jobLocation),
        remote: remote ? 'remote' : '',
        pay_text: salaryText(job.baseSalary),
        pay_kind: job.baseSalary ? 'paid' : '',
      },
    };
  }
  const ev = nodes.find((n) => typeOf(n).some((t) => /Event$/.test(t)));
  if (ev) {
    const online = /Online/i.test(String(ev.eventAttendanceMode || ''));
    return {
      found: 'Event',
      draft: {
        kind: 'event',
        title: txt(ev.name),
        org: txt(nameOf(ev.organizer) || nameOf(ev.performer)),
        starts_at: iso(ev.startDate),
        ends_at: iso(ev.endDate),
        location: placeOf(ev.location),
        remote: online ? 'remote' : '',
      },
    };
  }
  const title = metaContent(html, 'og:title') || txt((/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html || '') || [])[1]);
  const org = metaContent(html, 'og:site_name');
  if (title || org) return { found: 'meta', draft: { title: title.slice(0, 120), org: org.slice(0, 80) } };
  return { found: null, draft: {} };
}
