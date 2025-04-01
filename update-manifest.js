const fs = require('fs');
const path = require('path');

const manifestPath = path.join(__dirname, 'dist', 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

// 自动替换关键路径
manifest.background.service_worker = 'background.bundle.js';
manifest.content_scripts[0].js = ['content.bundle.js'];

// 保留其他自定义配置
manifest.name = "自动操作控制台";
manifest.version = "1.0";
manifest.permissions = ["activeTab", "scripting", "storage", "tabs", "alarms"];

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));