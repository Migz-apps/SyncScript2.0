/**
 * Copies runtime npm deps into extension/runtime/ for VSIX packaging.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const runtimeDir = path.join(root, 'extension', 'runtime');
const deps = ['diff-match-patch', 'ws'];

const candidates = [
  path.join(root, 'extension', 'node_modules'),
  path.join(root, 'node_modules'),
];

function resolveDep(name) {
  for (const base of candidates) {
    const full = path.join(base, name);
    if (fs.existsSync(full)) {
      return full;
    }
  }
  return null;
}

if (fs.existsSync(runtimeDir)) {
  fs.rmSync(runtimeDir, { recursive: true, force: true });
}
fs.mkdirSync(runtimeDir, { recursive: true });

for (const dep of deps) {
  const src = resolveDep(dep);
  if (!src) {
    console.error(`Could not find ${dep}. Run npm install from repo root first.`);
    process.exit(1);
  }
  fs.cpSync(src, path.join(runtimeDir, dep), { recursive: true });
  console.log(`Staged ${dep}`);
}
