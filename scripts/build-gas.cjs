const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('Building Vite production bundle...');
execSync('npm run build', { stdio: 'inherit' });

const gasDir = path.join(__dirname, '..', 'gas');
if (!fs.existsSync(gasDir)) {
  fs.mkdirSync(gasDir, { recursive: true });
}

const distIndexHtml = path.join(__dirname, '..', 'dist', 'index.html');
const distAssetsDir = path.join(__dirname, '..', 'dist', 'assets');

let html = fs.readFileSync(distIndexHtml, 'utf8');

// Find css and js files in dist/assets
const files = fs.readdirSync(distAssetsDir);
const cssFile = files.find(f => f.endsWith('.css'));
const jsFile = files.find(f => f.endsWith('.js'));

if (cssFile) {
  const cssContent = fs.readFileSync(path.join(distAssetsDir, cssFile), 'utf8');
  html = html.replace(
    new RegExp(`<link rel="stylesheet"[^>]*href="/assets/${cssFile}">`),
    `<style>\n${cssContent}\n</style>`
  );
}

if (jsFile) {
  const jsContent = fs.readFileSync(path.join(distAssetsDir, jsFile), 'utf8');
  html = html.replace(
    new RegExp(`<script type="module"[^>]*src="/assets/${jsFile}"></script>`),
    `<script type="module">\n${jsContent}\n</script>`
  );
}

// Add GAS base target
if (!html.includes('<base target="_top">')) {
  html = html.replace('<head>', '<head>\n    <base target="_top">');
}

const outputHtmlPath = path.join(gasDir, 'Index.html');
fs.writeFileSync(outputHtmlPath, html, 'utf8');

const codeGsContent = `/**
 * Google Apps Script Web App Controller - SEKOLAHKU SDN Rawa Badak Utara 21
 */
function doGet(e) {
  return HtmlService.createTemplateFromFile("Index")
    .evaluate()
    .setTitle("SEKOLAHKU - SDN Rawa Badak Utara 21")
    .addMetaTag("viewport", "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
`;

const outputCodeGsPath = path.join(gasDir, 'Code.gs');
fs.writeFileSync(outputCodeGsPath, codeGsContent, 'utf8');

console.log('✓ Successfully generated Google Apps Script files:');
console.log('  -> ' + outputCodeGsPath);
console.log('  -> ' + outputHtmlPath + ' (' + (fs.statSync(outputHtmlPath).size / 1024 / 1024).toFixed(2) + ' MB)');
