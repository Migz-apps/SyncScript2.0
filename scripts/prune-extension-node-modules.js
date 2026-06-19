/**
 * Keeps only runtime deps needed by the packaged VSIX (avoids huge/broken node_modules).
 */
const fs = require('fs');
const path = require('path');

const extensionDir = path.join(__dirname, '..', 'extension');
const nodeModules = path.join(extensionDir, 'node_modules');
const keep = ['diff-match-patch', 'ws'];

if (!fs.existsSync(nodeModules)) {
  console.error('extension/node_modules missing — run npm install from repo root first.');
  process.exit(1);
}

for (const entry of fs.readdirSync(nodeModules)) {
  if (!keep.includes(entry)) {
    fs.rmSync(path.join(nodeModules, entry), { recursive: true, force: true });
  }
}

for (const dep of keep) {
  if (!fs.existsSync(path.join(nodeModules, dep))) {
    console.error(`Missing required runtime dependency: ${dep}`);
    process.exit(1);
  }
}

console.log(`Prepared extension/node_modules with: ${keep.join(', ')}`);
