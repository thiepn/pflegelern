import assert from 'node:assert/strict';
import fs from 'node:fs';

let tests = 0;
const check = (fn) => { fn(); tests += 1; };
const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const css = read('css/p21-care-theme.css');
const ui = read('js/p21-care-ui.js');
const bootstrap = read('js/p18-bootstrap.js');
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

check(() => assert.ok(contrast('#0f172a','#ffffff') >= 7));
check(() => assert.ok(contrast('#475569','#ffffff') >= 4.5));
check(() => assert.ok(contrast('#64748b','#ffffff') >= 4.5));
check(() => assert.ok(contrast('#0e6b6d','#ffffff') >= 4.5));
check(() => assert.ok(contrast('#2563eb','#ffffff') >= 4.5));
check(() => assert.ok(contrast('#f8fafc','#12201f') >= 7));
check(() => assert.ok(contrast('#cad5d3','#12201f') >= 4.5));
check(() => assert.ok(contrast('#9fb0ad','#12201f') >= 4.5));
check(() => assert.ok(contrast('#ffffff','#0f6b66') >= 4.5));

check(() => assert.match(css, /--font-ui:/));
check(() => assert.match(css, /--sidebar-bg:/));
check(() => assert.match(css, /linear-gradient\(165deg, var\(--sidebar-bg\)/));
check(() => assert.match(css, /\.button[\s\S]*var\(--button-primary-text\) !important/));
check(() => assert.match(css, /\.question-shell[\s\S]*var\(--radius-xl\)/));
check(() => assert.match(css, /\.answer-option:has\(input:checked\)/));
check(() => assert.match(css, /grid-template-columns: repeat\(5, 1fr\)/));
check(() => assert.match(css, /\.care-data-card--backup/));
check(() => assert.match(css, /\.care-data-card--restore/));
check(() => assert.match(css, /\.p20-overview/));
check(() => assert.match(css, /prefers-color-scheme: dark/));

check(() => assert.match(ui, /data-p21-settings-tab/));
check(() => assert.match(ui, /Fortschritt sichern/));
check(() => assert.match(ui, /Fortschritt wiederherstellen/));
check(() => assert.match(ui, /Lokal · nur auf deinem Gerät/));
check(() => assert.doesNotMatch(ui, /Cloud/));
check(() => assert.match(ui, /MutationObserver/));
check(() => assert.match(ui, /aria-pressed/));

check(() => assert.match(bootstrap, /initMockExamUi\(\);[\s\S]*initCareThemeUi\(\);/));
check(() => assert.match(bootstrap, /installMockExamPatches\(\)/));
check(() => assert.match(sw, /pflegelern-p21-v1\.1\.0-dev21/));
check(() => assert.match(sw, /\.\/css\/p21-care-theme\.css/));
check(() => assert.match(sw, /\.\/js\/p21-care-ui\.js/));
check(() => assert.equal(manifest.phase, 'P21'));
check(() => assert.equal(manifest.version, '1.1.0-dev.21'));
check(() => assert.equal(manifest.status, 'p21-care-design-system'));
check(() => assert.ok(manifest.notes.some((x) => x.startsWith('P21 '))));

console.log(JSON.stringify({ phase: 'P21-care-design', tests, errors: 0 }, null, 2));
