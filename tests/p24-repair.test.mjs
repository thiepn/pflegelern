import assert from 'node:assert/strict';
import fs from 'node:fs';

let tests = 0;
const check = (fn) => { fn(); tests += 1; };
const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const css = read('css/p24-regression.css');
const sw = read('service-worker.js');
const storage = read('js/storage.js');
const ui = read('js/p24-ui.js');
const bootstrap = read('js/p18-bootstrap.js');
const manifestWeb = JSON.parse(read('manifest.webmanifest'));
const icon = read('icons/icon.svg');
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

check(() => assert.ok(contrast('#74838b', '#fbfcfc') >= 3));
check(() => assert.ok(contrast('#6d7a81', '#242a2e') >= 3));
check(() => assert.match(css, /@media \(max-width: 959px\)/));
check(() => assert.match(css, /grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/));
check(() => assert.match(css, /\.bottom-nav-link \{[\s\S]*position: relative/));
check(() => assert.match(css, /backdrop-filter: none/));
check(() => assert.match(css, /margin-left: 0/));
check(() => assert.doesNotMatch(css, /calc\(var\(--mobile-header-height\)/));

check(() => assert.match(sw, /const CACHE_PREFIX = 'pflegelern-'/));
check(() => assert.match(sw, /key\.startsWith\(CACHE_PREFIX\) && key !== CACHE/));
check(() => assert.match(sw, /pflegelern-p24-v1\.1\.0-dev24/));
check(() => assert.match(sw, /\.\/css\/p24-regression\.css/));
check(() => assert.match(sw, /\.\/js\/p24-ui\.js/));

check(() => assert.match(storage, /const LEARNING_STORES = \[/));
check(() => assert.match(storage, /for \(const name of LEARNING_STORES\) tx\.objectStore\(name\)\.clear\(\)/));
check(() => assert.match(storage, /transactionStores/));
check(() => assert.match(storage, /export \{ STORE_DEFS, LEARNING_STORES/));

check(() => assert.match(ui, /APP_VERSION = '1\.1\.0-dev\.24'/));
check(() => assert.match(ui, /p24BrowserReady/));
check(() => assert.match(ui, /data-p24-regression/));
check(() => assert.match(bootstrap, /initP24RegressionUi\(\);[\s\S]*await installExamPlanPatches/));

check(() => assert.equal(manifestWeb.background_color, '#e9edef'));
check(() => assert.equal(manifestWeb.theme_color, '#28658f'));
check(() => assert.match(icon, /#28658f/));
check(() => assert.doesNotMatch(icon, /#287b74/));

check(() => assert.equal(manifest.phase, 'P24'));
check(() => assert.equal(manifest.version, '1.1.0-dev.24'));
check(() => assert.equal(manifest.status, 'p24-regression-repair-browser-qa'));
check(() => assert.ok(manifest.notes.some((x) => x.startsWith('P24 '))));

console.log(JSON.stringify({ phase: 'P24-regression-repair', tests, errors: 0 }, null, 2));
