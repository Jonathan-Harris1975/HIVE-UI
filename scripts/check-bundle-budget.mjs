#!/usr/bin/env node
// Production bundle measurement and hard budget gate.
//
// The previous file referred to a v0.7.0 hand-measured baseline. That number is
// no longer used as release evidence. This script measures the bundle produced
// by the current build on every run, writes a machine-readable metrics file and
// publishes the numbers to the GitHub Actions step summary when available.
import { gzipSync } from "node:zlib";
import { appendFileSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";

const DIST_DIR = process.argv[2] || "dist";
const packageMetadata = JSON.parse(readFileSync("package.json", "utf8"));
const budgetConfig = JSON.parse(readFileSync("config/bundle-budget.json", "utf8"));
const JS_BUDGET_BYTES = Number(process.env.HIVE_UI_JS_GZIP_BUDGET_BYTES || budgetConfig.jsGzipBudgetBytes);
const CSS_BUDGET_BYTES = Number(process.env.HIVE_UI_CSS_GZIP_BUDGET_BYTES || budgetConfig.cssGzipBudgetBytes);

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

function kib(bytes) {
  return (bytes / 1024).toFixed(1);
}

function main() {
  let files;
  try {
    files = walk(DIST_DIR).filter((file) => !file.endsWith("bundle-metrics.json"));
  } catch (error) {
    console.error(`Could not read ${DIST_DIR}: ${error.message}`);
    console.error("Run `npm run build` before this script.");
    process.exit(1);
  }

  const jsFiles = files.filter((f) => extname(f) === ".js");
  const cssFiles = files.filter((f) => extname(f) === ".css");
  const jsTotal = jsFiles.reduce((sum, f) => sum + gzipSize(f), 0);
  const cssTotal = cssFiles.reduce((sum, f) => sum + gzipSize(f), 0);

  const metrics = {
    schemaVersion: 1,
    packageVersion: packageMetadata.version,
    jsGzipBytes: jsTotal,
    cssGzipBytes: cssTotal,
    jsFileCount: jsFiles.length,
    cssFileCount: cssFiles.length,
    budgets: {
      jsGzipBytes: JS_BUDGET_BYTES,
      cssGzipBytes: CSS_BUDGET_BYTES,
    },
  };
  writeFileSync(join(DIST_DIR, "bundle-metrics.json"), `${JSON.stringify(metrics, null, 2)}\n`);

  console.log(`JS gzip total:  ${kib(jsTotal)} KiB (budget ${kib(JS_BUDGET_BYTES)} KiB, ${jsFiles.length} files)`);
  console.log(`CSS gzip total: ${kib(cssTotal)} KiB (budget ${kib(CSS_BUDGET_BYTES)} KiB, ${cssFiles.length} files)`);

  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      `## HIVE-UI bundle metrics\n\n` +
      `| Asset | Current | Budget | Files |\n| --- | ---: | ---: | ---: |\n` +
      `| JavaScript gzip | ${kib(jsTotal)} KiB | ${kib(JS_BUDGET_BYTES)} KiB | ${jsFiles.length} |\n` +
      `| CSS gzip | ${kib(cssTotal)} KiB | ${kib(CSS_BUDGET_BYTES)} KiB | ${cssFiles.length} |\n\n` +
      `Measured from package version \`${packageMetadata.version}\`.\n\n`);
  }

  let failed = false;
  if (jsTotal > JS_BUDGET_BYTES) {
    console.error(`FAIL: JS bundle exceeds budget by ${kib(jsTotal - JS_BUDGET_BYTES)} KiB`);
    failed = true;
  }
  if (cssTotal > CSS_BUDGET_BYTES) {
    console.error(`FAIL: CSS bundle exceeds budget by ${kib(cssTotal - CSS_BUDGET_BYTES)} KiB`);
    failed = true;
  }

  if (failed) process.exit(1);
  console.log(`Bundle budget check passed; metrics written to ${join(DIST_DIR, "bundle-metrics.json")}.`);
}

main();
