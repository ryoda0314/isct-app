/*
 * Disk IO 原因追求スクリプト
 *
 * 前提: supabase/_diag-io-rpc.sql を SQL Editor で実行済み（一時診断RPC diag_sql が存在）。
 *
 * 実行:
 *   node --env-file=.env.local scripts/diag-io.cjs            # 既定60秒ウィンドウで計測
 *   node --env-file=.env.local scripts/diag-io.cjs --window 120
 *   node --env-file=.env.local scripts/diag-io.cjs --snapshot # 差分なし・現状スナップショットのみ
 *
 * 計測中はアプリを普通に使う / 起動し直す等で負荷をかけると、
 * その窓で実際に走ったクエリのIO増分が pg_stat_statements 差分に出ます。
 */
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error('ENV missing: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }

const args = process.argv.slice(2);
const SNAPSHOT_ONLY = args.includes('--snapshot');
const WINDOW_S = (() => { const i = args.indexOf('--window'); return i >= 0 ? Number(args[i + 1]) : 60; })();
const SAMPLE_MS = 2000;

const sb = createClient(URL, KEY, { auth: { persistSession: false } });

async function q(sql) {
  const { data, error } = await sb.rpc('diag_sql', { q: sql.trim() });
  if (error) throw new Error(error.message || JSON.stringify(error));
  return data || [];
}
async function safe(sql) { try { return await q(sql); } catch (e) { return { __error: e.message }; } }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// --- 診断クエリ ---------------------------------------------------------------
const STATEMENTS = `
  select queryid, calls, total_exec_time, mean_exec_time, rows,
         shared_blks_hit, shared_blks_read, shared_blks_dirtied, shared_blks_written,
         temp_blks_read, temp_blks_written, left(query, 400) as query
  from pg_stat_statements
  where dbid = (select oid from pg_database where datname = current_database())`;

const ACTIVITY = `
  select pid, usename, state, wait_event_type, wait_event,
         round(extract(epoch from (now() - query_start))::numeric, 1) as dur_s,
         left(query, 300) as query
  from pg_stat_activity
  where datname = current_database() and pid <> pg_backend_pid()
    and state is distinct from 'idle'
  order by dur_s desc nulls last`;

const STATIO = `
  select relname,
         heap_blks_read, heap_blks_hit,
         coalesce(idx_blks_read,0) as idx_blks_read, coalesce(idx_blks_hit,0) as idx_blks_hit,
         coalesce(toast_blks_read,0) as toast_blks_read
  from pg_statio_user_tables
  where schemaname = 'public'
  order by (heap_blks_read + coalesce(idx_blks_read,0) + coalesce(toast_blks_read,0)) desc
  limit 25`;

const TABLESTAT = `
  select relname, seq_scan, seq_tup_read, idx_scan,
         n_live_tup, n_dead_tup, n_tup_ins, n_tup_upd, n_tup_del, n_tup_hot_upd,
         autovacuum_count,
         to_char(last_autovacuum, 'YYYY-MM-DD HH24:MI') as last_autovacuum
  from pg_stat_user_tables
  where schemaname = 'public'
  order by seq_tup_read desc
  limit 25`;

const SIZES = `
  select c.relname,
         pg_total_relation_size(c.oid) as bytes,
         pg_size_pretty(pg_total_relation_size(c.oid)) as total_size,
         pg_size_pretty(pg_relation_size(c.oid)) as table_size,
         pg_size_pretty(pg_total_relation_size(c.oid) - pg_relation_size(c.oid)) as idx_toast_size
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
  order by bytes desc
  limit 25`;

const UNUSED_IDX = `
  select s.relname, s.indexrelname, s.idx_scan,
         pg_size_pretty(pg_relation_size(s.indexrelid)) as size
  from pg_stat_user_indexes s
  join pg_index i on i.indexrelid = s.indexrelid
  where s.schemaname = 'public' and s.idx_scan = 0 and not i.indisunique and not i.indisprimary
  order by pg_relation_size(s.indexrelid) desc`;

const CACHE = `
  select sum(heap_blks_read) as heap_read, sum(heap_blks_hit) as heap_hit,
         round(100.0 * sum(heap_blks_hit) / nullif(sum(heap_blks_hit) + sum(heap_blks_read), 0), 2) as hit_pct
  from pg_statio_user_tables`;

// --- 差分計算 -----------------------------------------------------------------
function diffStatements(t0, t1) {
  const m0 = new Map(t0.map(r => [r.queryid, r]));
  const out = [];
  for (const b of t1) {
    const a = m0.get(b.queryid) || {};
    const d = (k) => Number(b[k] || 0) - Number(a[k] || 0);
    const io = d('shared_blks_read') + d('shared_blks_written') + d('temp_blks_read') + d('temp_blks_written');
    const calls = d('calls');
    if (io <= 0 && calls <= 0) continue;
    out.push({
      query: b.query,
      calls,
      total_ms: +d('total_exec_time').toFixed(1),
      mean_ms: calls > 0 ? +(d('total_exec_time') / calls).toFixed(2) : 0,
      blks_read: d('shared_blks_read'),
      blks_written: d('shared_blks_written'),
      temp_read: d('temp_blks_read'),
      temp_written: d('temp_blks_written'),
      blks_hit: d('shared_blks_hit'),
      io_blks: io,
    });
  }
  return out;
}

function table(rows, cols) {
  if (!Array.isArray(rows)) return '  (error: ' + (rows && rows.__error) + ')';
  if (rows.length === 0) return '  (none)';
  const head = cols.join(' | ');
  const lines = rows.map(r => cols.map(c => String(r[c] ?? '')).join(' | '));
  return [head, head.replace(/[^|]/g, '-'), ...lines].join('\n');
}

(async () => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = path.join(__dirname, 'diag-logs');
  fs.mkdirSync(outDir, { recursive: true });
  const report = [];
  const log = (s = '') => { console.log(s); report.push(s); };

  // 接続/バージョン確認
  const ver = await safe(`select version() as v, current_database() as db`);
  log(`# Disk IO 診断  ${new Date().toISOString()}`);
  log('```');
  log(JSON.stringify(ver, null, 2));
  log('```');

  // 累積 pg_stat_statements（再起動以降に蓄積したIO上位） — 両モードで取得
  const cumRows = await safe(STATEMENTS);
  let cumTop = null;
  if (Array.isArray(cumRows)) {
    cumTop = cumRows.map(r => ({
      io_blks: Number(r.shared_blks_read || 0) + Number(r.shared_blks_written || 0) + Number(r.temp_blks_read || 0) + Number(r.temp_blks_written || 0),
      blks_read: Number(r.shared_blks_read || 0),
      blks_written: Number(r.shared_blks_written || 0),
      temp_read: Number(r.temp_blks_read || 0),
      calls: Number(r.calls || 0),
      total_ms: +Number(r.total_exec_time || 0).toFixed(0),
      mean_ms: +Number(r.mean_exec_time || 0).toFixed(2),
      query: r.query,
    })).sort((a, b) => b.io_blks - a.io_blks).slice(0, 20);
    log('\n## 累積IO上位クエリ TOP20（再起動以降, blks=8KB単位）');
    log('```');
    log(table(cumTop, ['io_blks', 'blks_read', 'blks_written', 'temp_read', 'calls', 'total_ms', 'mean_ms', 'query']));
    log('```');
  } else {
    log('\n累積pg_stat_statements取得失敗: ' + (cumRows && cumRows.__error));
  }

  let stmtDiff = null;
  if (!SNAPSHOT_ONLY) {
    log(`\n## pg_stat_statements 差分（${WINDOW_S}秒ウィンドウ）`);
    log(`計測開始。この間にアプリを起動/操作して負荷をかけてください…`);
    const t0 = await safe(STATEMENTS);
    if (t0.__error) { log('  pg_stat_statements 取得失敗: ' + t0.__error); }
    const samples = [];
    const iters = Math.max(1, Math.floor((WINDOW_S * 1000) / SAMPLE_MS));
    for (let i = 0; i < iters; i++) {
      await sleep(SAMPLE_MS);
      const act = await safe(ACTIVITY);
      if (Array.isArray(act) && act.length) samples.push({ t: ((i + 1) * SAMPLE_MS / 1000), act });
      process.stdout.write('.');
    }
    process.stdout.write('\n');
    const t1 = await safe(STATEMENTS);
    if (Array.isArray(t0) && Array.isArray(t1)) {
      stmtDiff = diffStatements(t0, t1)
        .sort((a, b) => b.io_blks - a.io_blks)
        .slice(0, 20);
      log('\n### IO増分が大きいクエリ TOP20（blks=8KB単位）');
      log('```');
      log(table(stmtDiff, ['io_blks', 'blks_read', 'blks_written', 'temp_read', 'calls', 'total_ms', 'mean_ms', 'query']));
      log('```');
    }
    // ウィンドウ中に見えたアクティブクエリ
    log('\n### ウィンドウ中のアクティブ/待機クエリ（サンプリング）');
    log('```');
    if (samples.length === 0) log('  (アイドルのみ — 負荷がかかっていない可能性)');
    for (const s of samples) {
      log(`-- t=${s.t}s`);
      log(table(s.act, ['dur_s', 'state', 'wait_event_type', 'wait_event', 'query']));
    }
    log('```');
  }

  // 静的スナップショット
  const [statio, tablestat, sizes, unused, cache, activityNow] = await Promise.all([
    safe(STATIO), safe(TABLESTAT), safe(SIZES), safe(UNUSED_IDX), safe(CACHE), safe(ACTIVITY),
  ]);

  log('\n## キャッシュヒット率（全テーブル合計）');
  log('```'); log(JSON.stringify(cache, null, 2)); log('```');

  log('\n## 物理読み込みが多いテーブル TOP25 (pg_statio_user_tables)');
  log('```'); log(table(statio, ['relname', 'heap_blks_read', 'heap_blks_hit', 'idx_blks_read', 'toast_blks_read'])); log('```');

  log('\n## seqスキャン/書き込みチャーン TOP25 (pg_stat_user_tables)');
  log('```'); log(table(tablestat, ['relname', 'seq_scan', 'seq_tup_read', 'idx_scan', 'n_live_tup', 'n_dead_tup', 'n_tup_upd', 'n_tup_hot_upd', 'autovacuum_count', 'last_autovacuum'])); log('```');

  log('\n## テーブルサイズ TOP25');
  log('```'); log(table(sizes, ['relname', 'total_size', 'table_size', 'idx_toast_size'])); log('```');

  log('\n## 未使用インデックス（idx_scan=0, IO書き込みの無駄）');
  log('```'); log(table(unused, ['relname', 'indexrelname', 'idx_scan', 'size'])); log('```');

  log('\n## 現在のアクティブクエリ');
  log('```'); log(table(activityNow, ['dur_s', 'state', 'wait_event_type', 'wait_event', 'query'])); log('```');

  const mdPath = path.join(outDir, `io-${stamp}.md`);
  const jsonPath = path.join(outDir, `io-${stamp}.json`);
  fs.writeFileSync(mdPath, report.join('\n'));
  fs.writeFileSync(jsonPath, JSON.stringify({ ver, cumTop, stmtDiff, statio, tablestat, sizes, unused, cache, activityNow }, null, 2));
  console.log(`\n[saved] ${mdPath}`);
  console.log(`[saved] ${jsonPath}`);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
