import assert from 'node:assert/strict';
import fs from 'node:fs';

let tests = 0;
const check = (fn) => { fn(); tests += 1; };
const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const css = read('css/p21-care-theme.css');
const lock = read('css/p22-accessibility.css');
const ui = read('js/p21-care-ui.js');
const index = read('index.html');
const sw = read('service-worker.js');
const manifest = JSON.parse(read('data/manifest.json'));

function rgb(hex) {
  const value = hex.replace('#','');
  return [0,2,4].map((i) => Number.parseInt(value.slice(i,i+2),16) / 255);
}
function luminance(hex) {
  const [r,g,b] = rgb(hex).map((c) => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
  return .2126 * r + .7152 * g + .0722 * b;
}
function contrast(a,b) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x,y) + .05) / (Math.min(x,y) + .05);
}

// Light mode structural contrast.
check(() => assert.ok(contrast('#1d2529','#f5f7f7') >= 7));
check(() => assert.ok(contrast('#4d5a61','#f5f7f7') >= 4.5));
check(() => assert.ok(contrast('#647179','#f5f7f7') >= 4.5));
check(() => assert.ok(contrast('#ffffff','#28658f') >= 4.5));
check(() => assert.ok(contrast('#174564','#dce8f0') >= 7));

// Dark mode is neutral graphite, not green-black.
check(() => assert.ok(contrast('#f0f2f3','#1c2125') >= 7));
check(() => assert.ok(contrast('#b8c0c5','#1c2125') >= 4.5));
check(() => assert.ok(contrast('#929da4','#1c2125') >= 4.5));
check(() => assert.ok(contrast('#10171b','#5f91b4') >= 4.5));

// Anti-template visual rules.
check(() => assert.doesNotMatch(css, /linear-gradient\(/));
check(() => assert.doesNotMatch(css, /radial-gradient\(/));
check(() => assert.doesNotMatch(css, /backdrop-filter/));
check(() => assert.match(css, /--radius-xl: 10px/));
check(() => assert.match(css, /--sidebar-bg: #f2f4f4/));
check(() => assert.match(css, /--bg: #15191c/));
check(() => assert.match(css, /border-right: 1px solid var\(--border\)/));
check(() => assert.match(css, /\.nav-link\.active::before/));
check(() => assert.match(css, /border-left: 4px solid var\(--accent\)/));
check(() => assert.match(css, /\.care-dashboard-grid/));
check(() => assert.match(css, /\.care-data-card[\s\S]*border-bottom: 1px solid var\(--border\)/));
check(() => assert.match(css, /\.question-shell,[\s\S]*border: 1px solid var\(--border-strong\)/));

// Accessibility lock and initial paint are static.
check(() => assert.match(lock, /--text-muted: #647179/));
check(() => assert.match(lock, /--accent: #28658f/));
check(() => assert.match(index, /data-p22-accessibility/));
check(() => assert.match(index, /content="#e9edef"/));
check(() => assert.match(index, /content="#15191c"/));
check(() => assert.match(index, /savedTheme === 'dark' \? 'dark' : 'light'/));

// UI behavior remains simple and explicit.
check(() => assert.match(ui, /data-theme="system"/));
check(() => assert.match(ui, /p23Dashboard/));
check(() => assert.match(ui, /care-dashboard-grid/));
check(() => assert.match(ui, /Sicherung erstellen/));
check(() => assert.match(ui, /keine Cloud-Synchronisierung/));
check(() => assert.match(ui, /#15191c/));
check(() => assert.match(ui, /#e9edef/));

check(() => assert.match(sw, /pflegelern-p23-v1\.1\.0-dev23/));
check(() => assert.match(sw, /\.\/css\/p22-accessibility\.css/));
check(() => assert.equal(manifest.phase, 'P23'));
check(() => assert.equal(manifest.version, '1.1.0-dev.23'));
check(() => assert.equal(manifest.status, 'p23-editorial-clinical-ui'));
check(() => assert.ok(manifest.notes.some((x) => x.startsWith('P23 '))));

console.log(JSON.stringify({ phase: 'P23-editorial-clinical-ui', tests, errors: 0 }, null, 2));
