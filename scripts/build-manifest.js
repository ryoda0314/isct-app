// Aggregate per-category manifests under public/stamps/<category>/manifest.json
// into a single public/stamps/manifest.json for client consumption.
// Run after each category processing script (process-stamps.js, slice-stamp-sheet.js).
const fs = require('fs');
const path = require('path');

const STAMPS_DIR = path.resolve(__dirname, '..', 'public', 'stamps');

// Display order (top-down in the picker)
const CATEGORY_ORDER = ['reactions', 'campus'];

const groups = [];
for (const cat of CATEGORY_ORDER) {
  const manifestPath = path.join(STAMPS_DIR, cat, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    console.warn(`skip: ${manifestPath} not found`);
    continue;
  }
  const m = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  groups.push(m);
}

const aggregate = { groups };
fs.writeFileSync(path.join(STAMPS_DIR, 'manifest.json'), JSON.stringify(aggregate, null, 2));
console.log(`stamps/manifest.json: ${groups.length} groups, ${groups.reduce((n, g) => n + g.stamps.length, 0)} stamps total`);
for (const g of groups) console.log(`  ${g.category} (${g.label}): ${g.stamps.length} stamps`);
