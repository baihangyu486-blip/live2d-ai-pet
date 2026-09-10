"use strict";

const path = require("node:path");
const { spawnSync } = require("node:child_process");

const projectRoot = path.resolve(__dirname, "..");
const suites = [
  ["--test", "scripts/test-chat-timeline.cjs"],
  ["--test", "src/main/home.test.js"],
  ["--test", "src/main/model-manager.test.js"],
  ["--test", "scripts/test-pet-renderer.cjs"],
  ["--test", "scripts/test-home-stage.cjs"],
  ["scripts/test-config-export.js"],
  ["scripts/test-home-main.cjs"],
  ["scripts/test-home-renderer.cjs"]
];

for (const args of suites) {
  const result = spawnSync(process.execPath, args, {
    cwd: projectRoot,
    stdio: "inherit"
  });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status || 1);
}
