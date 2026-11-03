/*
 * 构建：把引擎 + 控制器内联进 arena-ui.html 的骨架，产出可直接发布的单文件 fragment。
 * 用法：node build.js
 */
var fs = require('fs');
var path = require('path');

var root = __dirname;
var skeleton = fs.readFileSync(path.join(root, 'arena-ui.html'), 'utf8');
var engine = fs.readFileSync(path.join(root, 'src/engine/arena.js'), 'utf8');
var controller = fs.readFileSync(path.join(root, 'src/ui/controller.js'), 'utf8');

// 去掉骨架里可能已存在的脚本块，保证可重复构建
var marker = '<!-- NA_BUNDLE -->';
var idx = skeleton.indexOf(marker);
if (idx >= 0) { skeleton = skeleton.slice(0, idx).replace(/\s+$/, '') + '\n'; }

var closeTag = '<' + '/script>';
var bundle = marker + '\n<script>\n' + engine + '\n' + closeTag +
  '\n<script>\n' + controller + '\n' + closeTag + '\n';

// 插在根 div 结束前
var lastClose = skeleton.lastIndexOf('</div>');
var out = skeleton.slice(0, lastClose) + bundle + skeleton.slice(lastClose);

fs.writeFileSync(path.join(root, 'arena-ui.html'), out, 'utf8');

var scriptCount = (out.match(/^<script>$/gm) || []).length;
var closeCount = (out.match(/^<\/script>$/gm) || []).length;
console.log('构建完成 arena-ui.html');
console.log('  总大小 ' + (Buffer.byteLength(out, 'utf8') / 1024).toFixed(1) + ' KiB');
console.log('  script 标签 ' + scriptCount + ' 开 / ' + closeCount + ' 闭');
if (scriptCount !== closeCount) { console.error('  ✗ script 标签不配对'); process.exit(1); }
