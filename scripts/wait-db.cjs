/*
 * DB復旧待ちポーラー: PostgREST(=DB接続) が応答するまで軽いクエリで疎通確認。
 * 実行: node --env-file=.env.local scripts/wait-db.cjs
 */
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const probeUrl = `${URL}/rest/v1/profiles?select=moodle_id&limit=1`;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  for (let i = 1; i <= 80; i++) {
    const s = Date.now();
    const ts = new Date().toISOString().slice(11, 19);
    try {
      const r = await fetch(probeUrl, {
        headers: { apikey: KEY, Authorization: 'Bearer ' + KEY },
        signal: AbortSignal.timeout(6000),
      });
      const ms = Date.now() - s;
      if (r.ok || (r.status >= 200 && r.status < 500 && r.status !== 408)) {
        console.log(`[${ts}] #${i} DB ALIVE  status=${r.status} ${ms}ms  ← 復旧`);
        process.exit(0);
      }
      console.log(`[${ts}] #${i} status=${r.status} ${ms}ms (まだ)`);
    } catch (e) {
      console.log(`[${ts}] #${i} ${e.name} ${Date.now() - s}ms (まだ詰まり/再起動中)`);
    }
    await sleep(5000);
  }
  console.log('タイムアウト: 7分待っても復旧せず。手動で状態確認してください。');
  process.exit(2);
})();
