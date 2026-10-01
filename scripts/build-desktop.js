// scripts/build-desktop.js
//
// Builds a static export of the web app for bundling into the Tauri desktop shell.
// Only POS (and the login flow that gets a cashier there) needs to work offline, so this
// temporarily removes everything that can't survive `output: 'export'` (API routes, the
// signup Server Action, and every (restaurant)/* page that reads the server-side
// staff-session cookie), swaps in desktop-only client-component versions of the POS and
// login pages, builds, then restores everything so the web/Vercel build is completely
// unaffected.

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

const loginPage = 'app/login/page.tsx';
const loginPageDesktop = 'app/login/page.desktop.tsx';
const loginPageBackup = '.login-page-backup.tsx';

const staffPage = 'app/login/staff/page.tsx';
const staffPageDesktop = 'app/login/staff/page.desktop.tsx';
const staffPageBackup = '.staff-page-backup.tsx';

function moveIfExists(from, to) {
  if (fs.existsSync(from)) {
    fs.renameSync(from, to);
    return true;
  }
  return false;
}

/** Backs up `realPage`, copies `desktopPage` into its place if one exists. Returns whether
 *  `realPage` existed (so restoreAll knows whether to put it back). Warns instead of failing
 *  if the desktop variant is missing, so a build never silently ships with a stale page. */
function swapInDesktopPage(realPage, desktopPage, backupPage) {
  let hadRealPage = false;
  if (fs.existsSync(realPage)) {
    fs.renameSync(realPage, backupPage);
    hadRealPage = true;
  }
  if (fs.existsSync(desktopPage)) {
    fs.copyFileSync(desktopPage, realPage);
  } else if (hadRealPage) {
    console.warn(`Warning: ${desktopPage} not found — ${realPage} will build with no page.tsx.`);
  }
  return hadRealPage;
}

function restoreSwappedPage(realPage, backupPage, hadRealPage) {
  if (!hadRealPage) return;
  if (fs.existsSync(realPage)) fs.unlinkSync(realPage);
  fs.renameSync(backupPage, realPage);
}

// --- swap in desktop config -------------------------------------------------
fs.copyFileSync('next.config.js', webConfigBackup);
fs.copyFileSync('next.config.desktop.js', 'next.config.js');

// --- remove everything that can't survive static export --------------------
const hadApi = moveIfExists(apiDir, apiBackup);
const hadSignup = moveIfExists(signupDir, signupBackup);
const hadRestaurant = moveIfExists(restaurantDir, restaurantBackup);

// --- swap POS and the login flow for their desktop-only client-component versions ----
const hadPosPage = swapInDesktopPage(posPage, posPageDesktop, posPageBackup);
const hadLoginPage = swapInDesktopPage(loginPage, loginPageDesktop, loginPageBackup);
const hadStaffPage = swapInDesktopPage(staffPage, staffPageDesktop, staffPageBackup);

// --- clear stale cached build/type data -------------------------------------
// Leftover .next/ from a previous dev or web build still references files we just
// moved out (app/api/*/route.ts etc.), which makes Next's type checker fail trying
// to resolve modules that, from this build's perspective, no longer exist.
if (fs.existsSync('.next')) {
  fs.rmSync('.next', { recursive: true, force: true });
}

function restoreAll() {
  restoreSwappedPage(staffPage, staffPageBackup, hadStaffPage);
  restoreSwappedPage(loginPage, loginPageBackup, hadLoginPage);
  restoreSwappedPage(posPage, posPageBackup, hadPosPage);

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