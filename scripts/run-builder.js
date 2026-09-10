/*
  run-builder.js —— 稳定的 electron-builder 打包入口

  自动定位 electron-builder 的 CLI（标准解析 + .pnpm 兜底），
  并设置本地缓存目录，避免手动敲深层路径与 EBUSY 问题。
*/

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const projectRoot = path.resolve(__dirname, "..");

function findBuilderCli() {
  try {
    return require.resolve("electron-builder/out/cli/cli.js");
  } catch {}

  const pnpmDir = path.join(projectRoot, "node_modules", ".pnpm");

  if (fs.existsSync(pnpmDir)) {
    for (const entry of fs.readdirSync(pnpmDir)) {
      if (!entry.startsWith("electron-builder@")) {
        continue;
      }

      const candidate = path.join(
        pnpmDir,
        entry,
        "node_modules",
        "electron-builder",
        "out",
        "cli",
        "cli.js"
      );

      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }

  return null;
}

function runBuilder() {
  const cliPath = findBuilderCli();

  if (!cliPath) {
    console.error("打包失败：找不到 electron-builder 的 CLI。");
    console.error("请先执行 pnpm install 安装依赖。");
    process.exit(1);
    return;
  }

  const env = {
    ...process.env,
    ELECTRON_BUILDER_CACHE:
      process.env.ELECTRON_BUILDER_CACHE ||
      path.join(projectRoot, ".electron-builder-cache")
  };

  const child = spawn(
    process.execPath,
    [cliPath, ...process.argv.slice(2)],
    {
      stdio: "inherit",
      cwd: projectRoot,
      env
    }
  );

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
    } else {
      process.exit(code || 0);
    }
  });
}

if (require.main === module) {
  runBuilder();
}

module.exports = {
  findBuilderCli,
  runBuilder
};
