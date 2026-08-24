const fs = require('fs');
const path = require('path');

const ver = 'v=20260824f';
const dir = path.join(__dirname, '..', 'public');

for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.html'))) {
  const file = path.join(dir, f);
  let c = fs.readFileSync(file, 'utf8');
  c = c.replace(/(href="\/css\/[^"?]+\.css)"/g, `$1?${ver}"`);
  c = c.replace(/(src="\/js\/[^"?]+\.js)"/g, `$1?${ver}"`);
  fs.writeFileSync(file, c);
  console.log('versionado:', f);
}
