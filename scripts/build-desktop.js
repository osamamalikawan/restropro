const fs = require('fs');
const { execSync } = require('child_process');

const webConfigBackup = '.next.config.web.backup.js';
const apiDir = 'app/api';
const apiBackup = '.api-backup';

fs.copyFileSync('next.config.js', webConfigBackup);
fs.copyFileSync('next.config.desktop.js', 'next.config.js');

const hadApi = fs.existsSync(apiDir);
if (hadApi) fs.renameSync(apiDir, apiBackup);

try {
  execSync('next build', { stdio: 'inherit' });
  console.log('Desktop static export built at ./out');
} finally {
  if (hadApi) fs.renameSync(apiBackup, apiDir);
  fs.copyFileSync(webConfigBackup, 'next.config.js');
  fs.unlinkSync(webConfigBackup);
}