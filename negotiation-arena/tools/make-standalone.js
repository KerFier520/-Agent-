/*
 * 把 fragment 包成可在浏览器打开的独立页面，用于运行时 QA。
 * 注入与宿主一致的主题 token（浅色 + 深色），确保 QA 所见即发布所得。
 * 用法：node tools/make-standalone.js [--light]
 */
var fs = require('fs');
var path = require('path');
var root = path.join(__dirname, '..');
var frag = fs.readFileSync(path.join(root, 'arena-ui.html'), 'utf8');
var outDir = path.join(root, '.qa');
if (!fs.existsSync(outDir)) { fs.mkdirSync(outDir); }

var tokens = [
  ':root{',
  '  --background:#ffffff; --foreground:#0f1419;',
  '  --muted-foreground:#64748b; --border:#e2e8f0;',
  '  --primary:#2563eb; --primary-foreground:#ffffff;',
  '}',
  '@media (prefers-color-scheme: dark){',
  '  :root{',
  '    --background:#0f1419; --foreground:#e8edf4;',
  '    --muted-foreground:#8b98a9; --border:#232b36;',
  '    --primary:#4d94ff; --primary-foreground:#06121f;',
  '  }',
  '}',
  'body{margin:0;padding:24px;background:var(--background);color:var(--foreground);',
  '  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;}',
  '.wrap{max-width:1180px;margin:0 auto;}'
].join('\n');

var html = '<!DOCTYPE html>\n<html lang="zh-CN"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<title>Negotiation Arena</title><style>' + tokens + '</style></head>' +
  '<body><div class="wrap">' + frag + '</div></body></html>';

fs.writeFileSync(path.join(outDir, 'standalone.html'), html, 'utf8');
console.log('已生成 .qa/standalone.html (' + (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1) + ' KiB)');
