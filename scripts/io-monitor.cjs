/*
 * Disk IO 枯渇キャッチャー（常駐ロガー）
 *
 * 前提: supabase/_diag-io-rpc.sql 実行済み（diag_sql RPC が存在）。
 *
 * 実行（自分のターミナルで回しっぱなしにするのが確実）:
 *   node --env-file=.env.local scripts/io-monitor.cjs
 *   node --env-file=.env.local scripts/io-monitor.cjs --interval 120 --hours 12
 *
 * 出力:
 *   scripts/diag-logs/io-monitor-<開始時刻>.log    人間が読むサマリ＋ALERT
 *   scripts/diag-logs/io-monitor-<開始時刻>.jsonl   1サンプル1行の生データ
 *
 * 次に枯渇したら、その時間帯の ALERT ブロックを見れば犯人クエリ/負荷源が分かる。
 */
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error('ENV missing'); process.exit(1); }

const arg = (name, def) => { const i = process.argv.indexOf('--' + name); return i >= 0 ? Number(process.argv[i + 1]) : def; };
const INTERVAL_S = arg('interval', 120);      // サンプリング間隔（秒）
const HOURS = arg('hours', 12);               // 最大稼働時間
const CALL_TIMEOUT_MS = 9000;                 // 1クエリのハード上限（詰まり検知）
// しきい値（超えたら ALERT）
const TH_LATENCY_MS = 1500;                   // probe応答がこれより遅い＝絞られ始め
const TH_BLKS_READ = 20000;                   // 窓内の物理読込ブロック（×8KB）
const TH_WAL_MB = 50;                         // 窓内WAL生成量

// 各DBリクエストにタイムアウトを付与（詰まったら速やかに失敗→記録）
function fetchWithTimeout(input, init = {}) {
  return fetch(input, { ...init, signal: AbortSignal.timeout(CALL_TIMEOUT_MS) });
}
const sb = createClient(URL, KEY, { auth: { persistSession: false }, global: { fetch: fetchWithTimeout } });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function q(sql) {
  const { data, error } = await sb.rpc('diag_sql', { q: sql.trim() });
  if (error) throw new Error(error.message || JSON.stringify(error));
  return data || [];
}

const Q = {
  probe: `select 1 as ok`,
  dbstat: `select blks_read, blks_hit, temp_files, temp_bytes, deadlocks, tup_returned, tup_fetched
           from pg_stat_database where datname = current_database()`,
  wal: `select wal_records, wal_bytes, wal_fpi from pg_stat_wal`,
  stmts: `select queryid, calls, total_exec_time,
                 shared_blks_read, shared_blks_written, temp_blks_read, temp_blks_written,
                 left(query, 300) as query
          from pg_stat_statements
          where dbid = (select oid from pg_database where datname = current_database())`,
  activity: `select pid, backend_type, state, wait_event_type, wait_event,
                    round(extract(epoch from (now() - query_start))::numeric,1) as dur_s,
                    left(query, 240) as query
             from pg_stat_activity
             where datname = current_database() and pid <> pg_backend_pid()
               and state is distinct from 'idle'
             order by dur_s desc nulls last`,
  slots: `select slot_name, active,
                 round(pg_wal_lsn_diff(pg_current_wal_lsn(), confirmed_flush_lsn)/1048576.0,2) as behind_mb
          from pg_replication_slots`,
};

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = path.join(__dirname, 'diag-logs');
fs.mkdirSync(outDir, { recursive: true });
const logPath = path.join(outDir, `io-monitor-${stamp}.log`);
const jsonlPath = path.join(outDir, `io-monitor-${stamp}.jsonl`);
function out(s) { console.log(s); fs.appendFileSync(logPath, s + '\n'); }

const n = (v) => Number(v || 0);
function diffStmts(a, b) {
  const m = new Map((a || []).map(r => [r.queryid, r]));
  const res = [];
  for (const y of (b || [])) {
    const x = m.get(y.queryid) || {};
    const io = (n(y.shared_blks_read) - n(x.shared_blks_read)) + (n(y.shared_blks_written) - n(x.shared_blks_written))
             + (n(y.temp_blks_read) - n(x.temp_blks_read)) + (n(y.temp_blks_written) - n(x.temp_blks_written));
    const calls = n(y.calls) - n(x.calls);
    const ms = n(y.total_exec_time) - n(x.total_exec_time);
    if (io <= 0 && calls <= 0) continue;
    res.push({ io, calls, ms: +ms.toFixed(0), read: n(y.shared_blks_read) - n(x.shared_blks_read), query: y.query });
  }
  return res.sort((p, c) => c.io - p.io).slice(0, 8);
}

(async () => {
  const t0 = new Date();
  out(`# IO monitor 開始 ${t0.toISOString()}  interval=${INTERVAL_S}s hours=${HOURS}`);
  out(`# しきい値: latency>${TH_LATENCY_MS}ms / blks_read>${TH_BLKS_READ} / WAL>${TH_WAL_MB}MB → ALERT`);
  const endAt = t0.getTime() + HOURS * 3600 * 1000;
  let prev = null;

  while (Date.now() < endAt) {
    const ts = new Date().toISOString().slice(11, 19);
    const sample = { ts: new Date().toISOString() };
    let unresponsive = false;
    try {
      const s = Date.now();
      await q(Q.probe);
      sample.latency_ms = Date.now() - s;
    } catch (e) { unresponsive = true; sample.latency_ms = -1; sample.probe_err = e.name; }

    if (unresponsive) {
      out(`[${ts}] ⚠️ DB UNRESPONSIVE (probe ${sample.probe_err}) ← 枯渇ウィンドウの可能性`);
      // 詰まり中はアクティブクエリだけでも拾えるか試す
      try { sample.activity = await q(Q.activity); } catch {}
      fs.appendFileSync(jsonlPath, JSON.stringify(sample) + '\n');
      await sleep(INTERVAL_S * 1000);
      continue;
    }

    try { sample.dbstat = (await q(Q.dbstat))[0]; } catch (e) { sample.dbstat = { err: e.message }; }
    try { sample.wal = (await q(Q.wal))[0]; } catch (e) { sample.wal = { err: e.message }; }
    try { sample.stmts = await q(Q.stmts); } catch (e) { sample.stmts = []; }
    try { sample.slots = await q(Q.slots); } catch {}

    // 差分
    let blksRead = 0, walMb = 0, topStmts = [];
    if (prev) {
      blksRead = n(sample.dbstat?.blks_read) - n(prev.dbstat?.blks_read);
      walMb = (n(sample.wal?.wal_bytes) - n(prev.wal?.wal_bytes)) / 1048576;
      topStmts = diffStmts(prev.stmts, sample.stmts);
    }
    const slotLag = (sample.slots || []).reduce((m, s) => Math.max(m, n(s.behind_mb)), 0);
    const flagged = sample.latency_ms > TH_LATENCY_MS || blksRead > TH_BLKS_READ || walMb > TH_WAL_MB;

    const line = `[${ts}] lat=${sample.latency_ms}ms blks_read=+${blksRead} WAL=+${walMb.toFixed(1)}MB slotLag=${slotLag.toFixed(1)}MB`;
    if (flagged) {
      out(`\n========== ⚠️ ALERT [${ts}] ==========`);
      out(line);
      out('-- IO増分が大きいクエリ:');
      for (const r of topStmts) out(`   io=${r.io} read=${r.read} calls=${r.calls} ms=${r.ms} :: ${r.query.replace(/\s+/g, ' ')}`);
      out('-- そのときのアクティブクエリ:');
      try {
        const act = await q(Q.activity);
        for (const a of act) out(`   dur=${a.dur_s}s ${a.backend_type}/${a.state} wait=${a.wait_event_type||'-'}:${a.wait_event||'-'} :: ${(a.query||'').replace(/\s+/g,' ')}`);
      } catch {}
      out('=====================================\n');
    } else {
      out(line);
    }
    fs.appendFileSync(jsonlPath, JSON.stringify({ ...sample, blksRead, walMb: +walMb.toFixed(2), slotLag }) + '\n');
    prev = sample;
    await sleep(INTERVAL_S * 1000);
  }
  out(`# IO monitor 終了 ${new Date().toISOString()}`);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
