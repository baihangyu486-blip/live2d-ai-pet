/*
  activity.js —— 活动感知：前台窗口标题、空闲时间、活动文案
  从 main.js 拆分出的独立模块。
*/

const { execFile } = require("child_process");
const { getAiConfig } = require("./ai-config.js");
const {
  isCaptureAppActive
} = require("./screen-capture.js");

const ACTIVITY_POLL_INTERVAL = 8000;
// 活动与屏幕感知共用短缓存，避免同时启动两份 PowerShell。
const FOREGROUND_CACHE_TTL = 1500;

const activityState = {
  available: false,
  title: "",
  hwnd: 0,
  label: "",
  idleMs: 0,
  captureActive: false,
  at: 0
};

let activityMonitorTimer = null;
let foregroundCache = null;
let foregroundRequest = null;

function getActivityLabel(title) {
  const value = String(title || "");

  if (!value) {
    return "";
  }

  if (/Visual Studio Code|VS Code|Code - Insiders|JetBrains|PyCharm|WebStorm|IntelliJ|Sublime Text/.test(value)) {
    return "写代码";
  }

  if (/哔哩哔哩|bilibili|YouTube|抖音|爱奇艺|腾讯视频|优酷|视频/.test(value)) {
    return "看视频";
  }

  if (/Steam|游戏|原神|英雄联盟|LOL|王者荣耀|CS2|Counter|Dota|Minecraft|我的世界|瓦罗兰特|Valorant/.test(value)) {
    return "打游戏";
  }

  if (/微信|WeChat|QQ|Telegram|Discord|钉钉|飞书/.test(value)) {
    return "跟人聊天";
  }

  if (/Chrome|Edge|Firefox|浏览器|百度|Bing|知乎|微博|小红书|淘宝|京东/.test(value)) {
    return "上网冲浪";
  }

  if (/Word|Excel|PowerPoint|WPS|文档|表格|演示/.test(value)) {
    return "写文档办公";
  }

  if (/网易云|QQ音乐|Spotify|酷狗|酷我/.test(value)) {
    return "听音乐";
  }

  if (/终端|Terminal|PowerShell|cmd|命令提示符|Git Bash/.test(value)) {
    return "敲命令行";
  }

  return "处理其他事情";
}

function getForegroundWindowInfo() {
  const now = Date.now();

  if (foregroundCache && now - foregroundCache.at < FOREGROUND_CACHE_TTL) {
    return Promise.resolve({ ...foregroundCache.value });
  }

  if (foregroundRequest) {
    return foregroundRequest.then((value) => ({ ...value }));
  }

  foregroundRequest = new Promise((resolve) => {
    const script = `
Add-Type 'using System;using System.Runtime.InteropServices;public struct LastInputInfo{public uint cbSize;public uint dwTime;}';
Add-Type 'using System;using System.Runtime.InteropServices;public class Win32Helper{[DllImport("user32.dll")]public static extern IntPtr GetForegroundWindow();[DllImport("user32.dll",CharSet=CharSet.Unicode)]public static extern int GetWindowText(IntPtr h,System.Text.StringBuilder s,int n);[DllImport("user32.dll")]public static extern bool GetLastInputInfo(ref LastInputInfo l);}';
$h=[Win32Helper]::GetForegroundWindow();$sb=New-Object System.Text.StringBuilder 512;[Win32Helper]::GetWindowText($h,$sb,512)|Out-Null;$li=New-Object LastInputInfo;$li.cbSize=[uint32][System.Runtime.InteropServices.Marshal]::SizeOf($li);$ok=[Win32Helper]::GetLastInputInfo([ref]$li);if($ok){$idle=[Environment]::TickCount-$li.dwTime}else{$idle=-1};[Console]::OutputEncoding=[System.Text.Encoding]::UTF8;Write-Output ($sb.ToString()+"|"+$idle);
Write-Output ("HWND:"+$h.ToInt64());
`;

    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      { timeout: 6000, windowsHide: true, encoding: "utf8" },
      (error, stdout) => {
        if (error) {
          resolve({ title: "", idleMs: 0, hwnd: 0 });
          return;
        }

        const text = String(stdout || "").trim();
        const titleLine = text.split(/\r?\n/, 1)[0];
        const separator = titleLine.lastIndexOf("|");

        if (separator < 0) {
          resolve({ title: "", idleMs: 0, hwnd: 0 });
          return;
        }

        // 窗口标题本身可能含 |；HWND 在下一行，不能一起转为数字。
        const idleRaw = Number(titleLine.slice(separator + 1).trim());

        /*
          调用失败或数值异常（超过 48 小时）时按"未知"处理，
          避免误判用户离开而停止主动聊天。
        */
        const idleMs =
          Number.isFinite(idleRaw) &&
          idleRaw >= 0 &&
          idleRaw <= 48 * 60 * 60 * 1000
            ? idleRaw
            : 0;

        const hwndMatch = String(stdout || "").match(/HWND:(\d+)/);
        const hwnd = hwndMatch ? Number(hwndMatch[1]) : 0;

        resolve({
          title: titleLine.slice(0, separator).trim(),
          idleMs,
          hwnd
        });
      }
    );
  }).then((value) => {
    foregroundCache = { value: { ...value }, at: Date.now() };
    return value;
  }).finally(() => {
    foregroundRequest = null;
  });

  return foregroundRequest.then((value) => ({ ...value }));
}

async function pollActivity() {
  if (process.platform !== "win32") {
    return;
  }

  if (!getAiConfig().activity?.enabled) {
    activityState.available = false;
    return;
  }

  try {
    const info = await getForegroundWindowInfo();

    activityState.title = info.title;
    activityState.hwnd = Number(info.hwnd || 0);
    activityState.idleMs = info.idleMs;
    activityState.label = getActivityLabel(info.title);
    activityState.captureActive = isCaptureAppActive(info.title);
    activityState.at = Date.now();
    activityState.available = true;
  } catch (error) {
    activityState.available = false;
    activityState.hwnd = 0;
    activityState.captureActive = false;
  }
}

/*
  感知复用两条链路中较新的前台快照，避免正常 tick 再开 PowerShell。
  OCR 前仍需使用短缓存查询核实，不能把后台窗口当成当前前台读取。
*/
function getCachedForegroundWindowInfo(maxAge = ACTIVITY_POLL_INTERVAL) {
  if (!foregroundCache) {
    return null;
  }

  if (Date.now() - foregroundCache.at > Math.max(0, Number(maxAge) || 0)) {
    return null;
  }

  return { ...foregroundCache.value };
}

function startActivityMonitor() {
  clearInterval(activityMonitorTimer);

  pollActivity();

  activityMonitorTimer = setInterval(() => {
    pollActivity();
  }, ACTIVITY_POLL_INTERVAL);
}

function getActivityLines() {
  if (!activityState.available || !activityState.at) {
    return [];
  }

  const freshMs = Date.now() - activityState.at;
  const lines = [];

  if (activityState.label && freshMs < ACTIVITY_POLL_INTERVAL * 3) {
    lines.push(
      `用户当前活动：${activityState.label}（这是从窗口标题粗略判断的，自然地关心即可，不要主动点破具体软件名）`
    );
  }

  if (activityState.idleMs > 10 * 60 * 1000) {
    lines.push("用户已经离开屏幕一段时间了，安静陪着就好，不要打扰，也不要主动发消息。");
  }

  return lines;
}

module.exports = {
  ACTIVITY_POLL_INTERVAL,
  FOREGROUND_CACHE_TTL,
  activityState,
  activityMonitorTimer,
  getActivityLabel,
  getForegroundWindowInfo,
  getCachedForegroundWindowInfo,
  pollActivity,
  startActivityMonitor,
  getActivityLines
};
