// scripts/build-desktop.js
//
// Builds a static export of the web app for bundling into the Tauri desktop shell.
// Only POS needs to work offline, so this temporarily removes everything that can't
// survive `output: 'export'` (API routes, the signup Server Action, and every
// (restaurant)/* page that reads the server-side staff-session cookie), swaps in a
// desktop-only client-component version of the POS page, builds, then restores
// everything so the web/Vercel build is completely unaffected.

const fs = require('fs');
const { execSync } = require('child_process');

const webConfigBackup = '.next.config.web.backup.js';

const apiDir = 'app/api';
const apiBackup = '.api-backup';

const signupDir = 'app/signup';
const signupBackup = '.signup-backup';

const restaurantDir = 'app/(restaurant)';
const restaurantBackup = '.restaurant-backup';

const posPage = 'app/pos/page.tsx';
const posPageDesktop = 'app/pos/page.desktop.tsx';
const posPageBackup = '.pos-page-backup.tsx';

function moveIfExists(from, to) {
  if (fs.existsSync(from)) {
    fs.renameSync(from, to);
    return true;
  }
  return false;
}

// --- swap in desktop config -------------------------------------------------
fs.copyFileSync('next.config.js', webConfigBackup);
fs.copyFileSync('next.config.desktop.js', 'next.config.js');

// --- remove everything that can't survive static export --------------------
const hadApi = moveIfExists(apiDir, apiBackup);
const hadSignup = moveIfExists(signupDir, signupBackup);
const hadRestaurant = moveIfExists(restaurantDir, restaurantBackup);

// --- swap POS for its desktop-only client-component version ----------------
let hadPosPage = false;
if (fs.existsSync(posPage)) {
  fs.renameSync(posPage, posPageBackup);
  hadPosPage = true;
}
if (fs.existsSync(posPageDesktop)) {
  fs.copyFileSync(posPageDesktop, posPage);
} else if (hadPosPage) {
  console.warn(`Warning: ${posPageDesktop} not found — POS will build with no page.tsx.`);
}

// --- clear stale cached build/type data -------------------------------------
// Leftover .next/ from a previous dev or web build still references files we just
// moved out (app/api/*/route.ts etc.), which makes Next's type checker fail trying
// to resolve modules that, from this build's perspective, no longer exist.
if (fs.existsSync('.next')) {
  fs.rmSync('.next', { recursive: true, force: true });
}

function restoreAll() {
  if (hadPosPage) {
    if (fs.existsSync(posPage)) fs.unlinkSync(posPage);
    fs.renameSync(posPageBackup, posPage);
  }
  if (hadRestaurant) fs.renameSync(restaurantBackup, restaurantDir);
  if (hadSignup) fs.renameSync(signupBackup, signupDir);
  if (hadApi) fs.renameSync(apiBackup, apiDir);

  fs.copyFileSync(webConfigBackup, 'next.config.js');
  fs.unlinkSync(webConfigBackup);
}

try {
  execSync('next build', { stdio: 'inherit' });
  console.log('Desktop static export built at ./out');
} finally {
  restoreAll();
}