const puppeteer = require('puppeteer');
(async () => {
  const b = await puppeteer.launch({ headless:'new', args:['--no-sandbox'] });
  const p = await b.newPage();
  const seen=[];
  p.on('console', m=>{ if(['error','warning'].includes(m.type())) seen.push('['+m.type()+'] '+m.text()); });
  p.on('pageerror', e=>seen.push('[pageerror] '+e.message));
  p.on('requestfailed', r=>seen.push('[reqfail] '+r.url()+' '+(r.failure()&&r.failure().errorText)));
  await p.setViewport({ width: 380, height: 800 });
  await p.goto('http://localhost:3010/embed/demo#demo',{waitUntil:'networkidle2',timeout:45000});
  await new Promise(r=>setTimeout(r,4500));
  console.log('=== console issues ('+seen.length+') ===');
  console.log([...new Set(seen)].join('\n'));
  await b.close();
})().catch(e=>{console.error('FATAL',e.message);process.exit(1)});
