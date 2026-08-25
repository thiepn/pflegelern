import assert from 'node:assert/strict';
import fs from 'node:fs';

let tests = 0;
const check = (fn) => { fn(); tests += 1; };
const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const css = read('css/p21-care-theme.css');
const lock = read('css/p22-accessibility.css');
const ui = read('js/p21-care-ui.js');
const bootstrap = read('js/p18-bootstrap.js');
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

check(() => assert.ok(contrast('#152126','#ffffff') >= 7));
check(() => assert.ok(contrast('#526168','#ffffff') >= 4.5));
check(() => assert.ok(contrast('#68777e','#ffffff') >= 4.5));
check(() => assert.ok(contrast('#ffffff','#0d7f78') >= 4.5));
check(() => assert.ok(contrast('#f3f6f7','#182027') >= 7));
check(() => assert.ok(contrast('#c0c9cc','#182027') >= 4.5));
check(() => assert.ok(contrast('#97a5aa','#182027') >= 4.5));
check(() => assert.ok(contrast('#ffffff','#117b75') >= 4.5));

check(() => assert.match(css, /--bg: #f6f8f9/));
check(() => assert.match(css, /--surface: #ffffff/));
check(() => assert.match(css, /--sidebar-bg: #ffffff/));
check(() => assert.match(css, /\.sidebar[\s\S]*background: var\(--sidebar-bg\)/));
check(() => assert.doesNotMatch(css, /prefers-color-scheme: dark/));
check(() => assert.doesNotMatch(css, /linear-gradient\(165deg, var\(--sidebar-bg\)/));
check(() => assert.match(css, /\.care-dashboard-grid/));
check(() => assert.match(css, /grid-template-columns: minmax\(0, 1\.08fr\)/));
check(() => assert.match(css, /\.hero-action::before/));
check(() => assert.match(css, /\.question-shell[\s\S]*var\(--radius-xl\)/));
check(() => assert.match(css, /\.answer-option:has\(input:checked\)/));
check(() => assert.match(css, /grid-template-columns: repeat\(5, 1fr\)/));
check(() => assert.match(css, /\.care-data-card/));
check(() => assert.match(lock, /--button-primary: #0d7f78/));
check(() => assert.match(lock, /--text-muted: #68777e/));

check(() => assert.match(ui, /care-dashboard/));
check(() => assert.match(ui, /care-page-subtitle/));
check(() => assert.match(ui, /Backup erstellen/));
check(() => assert.match(ui, /Datei auswählen/));
check(() => assert.match(ui, /data-theme="system"/));
check(() => assert.match(ui, /system\?\.remove/));
check(() => assert.doesNotMatch(ui, /Cloud/));

check(() => assert.match(bootstrap, /resolvedTheme = savedTheme === 'dark' \? 'dark' : 'light'/));
check(() => assert.match(bootstrap, /initClinicalAccessibilityTokens\(\)/));
check(() => assert.match(index, /data-p20-exam-css/));
check(() => assert.match(index, /data-p21-care-theme/));
check(() => assert.ok(index.indexOf('data-p20-exam-css') < index.indexOf('data-p21-care-theme')));
check(() => assert.match(index, /savedTheme === 'dark' \? 'dark' : 'light'/));
check(() => assert.match(sw, /pflegelern-p22-v1\.1\.0-dev22/));
check(() => assert.match(sw, /\.\/css\/p22-accessibility\.css/));
check(() => assert.match(sw, /\.\/js\/p22-accessibility\.js/));
check(() => assert.equal(manifest.phase, 'P22'));
check(() => assert.equal(manifest.version, '1.1.0-dev.22'));
check(() => assert.equal(manifest.status, 'p22-clinical-clean-redesign'));
check(() => assert.ok(manifest.notes.some((x) => x.startsWith('P22 '))));

console.log(JSON.stringify({ phase: 'P22-clinical-clean', tests, errors: 0 }, null, 2));
