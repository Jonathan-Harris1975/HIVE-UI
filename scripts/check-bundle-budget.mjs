#!/usr/bin/env node
// Hard byte budget for the production bundle. Fails the build if exceeded.
//
// Baseline note (see docs/PRODUCTION_READINESS.md): the last real
// measurement recorded in this repo was ~198 KiB gzip JS at v0.7.0. Several
// releases have shipped since then with no re-measurement. The budget below
// is set conservatively above that stale baseline so it can start enforcing
// immediately; it should be tightened to match the real number the first
// time this actually runs in CI with network access, then ratcheted down
// over time rather than only ever raised.
import { gzipSync } from "node:zlib";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";

const DIST_DIR = process.argv[2] || "dist";
const JS_BUDGET_BYTES = Number(process.env.HIVE_UI_JS_GZIP_BUDGET_BYTES || 320 * 1024);
const CSS_BUDGET_BYTES = Number(process.env.HIVE_UI_CSS_GZIP_BUDGET_BYTES || 80 * 1024);

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function gzipSize(path) {
  return gzipSync(readFileSync(path)).length;
}

function main() {
  let files;
  try {
    files = walk(DIST_DIR);
  } catch (error) {
    console.error(`Could not read ${DIST_DIR}: ${error.message}`);
    console.error("Run `npm run build` before this script.");
    process.exit(1);
  }

  const jsFiles = files.filter((f) => extname(f) === ".js");
  const cssFiles = files.filter((f) => extname(f) === ".css");

  const jsTotal = jsFiles.reduce((sum, f) => sum + gzipSize(f), 0);
  const cssTotal = cssFiles.reduce((sum, f) => sum + gzipSize(f), 0);

  console.log(`JS gzip total:  ${(jsTotal / 1024).toFixed(1)} KiB (budget ${(JS_BUDGET_BYTES / 1024).toFixed(0)} KiB, ${jsFiles.length} files)`);
  console.log(`CSS gzip total: ${(cssTotal / 1024).toFixed(1)} KiB (budget ${(CSS_BUDGET_BYTES / 1024).toFixed(0)} KiB, ${cssFiles.length} files)`);

  let failed = false;
  if (jsTotal > JS_BUDGET_BYTES) {
    console.error(`FAIL: JS bundle exceeds budget by ${((jsTotal - JS_BUDGET_BYTES) / 1024).toFixed(1)} KiB`);
    failed = true;
  }
  if (cssTotal > CSS_BUDGET_BYTES) {
    console.error(`FAIL: CSS bundle exceeds budget by ${((cssTotal - CSS_BUDGET_BYTES) / 1024).toFixed(1)} KiB`);
    failed = true;
  }

  if (failed) process.exit(1);
  console.log("Bundle budget check passed.");
}

main();
