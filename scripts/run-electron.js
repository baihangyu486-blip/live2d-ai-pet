/*
  run-electron.js —— 稳定的 electron 启动入口

  自动在多个位置查找 Electron 可执行文件：
  1. require("electron") 标准解析
  2. node_modules/.store/ 下 electron 的虚拟存储（npm/bun 风格）
  3. node_modules/.pnpm/ 下 electron 的虚拟存储（pnpm 风格）
  4. node_modules/electron/dist/

  避免 pnpm 顶层链接失效时报 "Cannot find module 'electron'"。
*/

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const projectRoot = path.resolve(__dirname, "..");

function findElectronExecutable() {
  try {
    const resolved = require("electron");

    if (
      typeof resolved === "string" &&
      resolved &&
      fs.existsSync(resolved)
    ) {
      return resolved;
    }
  } catch {}

  const candidates = [];
  const stores = [".store", ".pnpm"];
  const modulesDir = path.join(projectRoot, "node_modules");

  for (const store of stores) {
    const storeDir = path.join(modulesDir, store);

    if (!fs.existsSync(storeDir)) {
      continue;
    }

    for (const entry of fs.readdirSync(storeDir)) {
      if (!entry.startsWith("electron@")) {
        continue;
      }

      const electronBase = path.join(
        storeDir,
        entry,
        "node_modules",
        "electron"
      );

      candidates.push(path.join(electronBase, "dist", "electron.exe"));
      candidates.push(path.join(electronBase, "dist", "electron"));
    }
  }

  candidates.push(
    path.join(modulesDir, "electron", "dist", "electron.exe"),
    path.join(modulesDir, "electron", "dist", "electron")
  );

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function startElectron() {
  const electronPath = findElectronExecutable();

  if (!electronPath) {
    console.error("启动失败：找不到 Electron 可执行文件。");
    console.error("请先在项目目录执行 pnpm install 安装依赖。");
    process.exit(1);
    return;
  }

  const child = spawn(electronPath, process.argv.slice(2), {
    stdio: "inherit",
    cwd: process.cwd()
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
    } else {
      process.exit(code || 0);
    }
  });
}

if (require.main === module) {
  startElectron();
}

module.exports = {
  findElectronExecutable,
  startElectron
};
