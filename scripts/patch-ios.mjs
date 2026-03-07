#!/usr/bin/env node
/**
 * Post-install / post-cap-sync patch script for iOS.
 *
 * 1. Patches @capacitor-community/apple-sign-in Package.swift
 *    to accept capacitor-swift-pm 7.x–8.x (no v8 release yet).
 *
 * 2. Patches ios/App/App/capacitor.config.json to include
 *    IronTracksNative in packageClassList so the Capacitor bridge
 *    loads our local Swift plugin.
 *
 * Run: node scripts/patch-ios.mjs
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

// ── 1. Patch apple-sign-in SPM version range ────────────────────────
const appleSignInPkg = resolve(
  root,
  'node_modules/@capacitor-community/apple-sign-in/Package.swift'
);

if (existsSync(appleSignInPkg)) {
  let content = readFileSync(appleSignInPkg, 'utf8');
  const old = '.package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "7.0.0")';
  const patched = '.package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", "7.0.0"..<"9.0.0")';
  if (content.includes(old)) {
    content = content.replace(old, patched);
    writeFileSync(appleSignInPkg, content, 'utf8');
    console.log('[patch-ios] ✅ apple-sign-in Package.swift patched (capacitor-swift-pm 7–8)');
  } else if (content.includes(patched)) {
    console.log('[patch-ios] ℹ️  apple-sign-in already patched');
  } else {
    console.log('[patch-ios] ⚠️  apple-sign-in Package.swift has unexpected content — skipped');
  }
} else {
  console.log('[patch-ios] ⚠️  apple-sign-in not found — skipped');
}

// ── 2. Patch capacitor.config.json packageClassList ─────────────────
const capConfigPath = resolve(root, 'ios/App/App/capacitor.config.json');

if (existsSync(capConfigPath)) {
  const raw = readFileSync(capConfigPath, 'utf8');
  const config = JSON.parse(raw);
  const classList = config.packageClassList || [];

  if (!classList.includes('IronTracksNative')) {
    classList.push('IronTracksNative');
    config.packageClassList = classList;
    writeFileSync(capConfigPath, JSON.stringify(config, null, '\t') + '\n', 'utf8');
    console.log('[patch-ios] ✅ capacitor.config.json patched (IronTracksNative added)');
  } else {
    console.log('[patch-ios] ℹ️  IronTracksNative already in packageClassList');
  }
} else {
  console.log('[patch-ios] ⚠️  capacitor.config.json not found — skipped');
}

console.log('[patch-ios] Done.');
