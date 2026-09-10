# AI 伴侣 · AI Companion

把普通的一天，聊成值得记住的日常。♡

一款面向 Windows 的 AI 桌面陪伴应用。柔和的樱花粉、圆润的聊天气泡，装下随时想说的话，也留住慢慢熟悉的小事。自定义她的名字与性格，从聊天、回忆到日记，让陪伴拥有自己的节奏。

![AI 伴侣聊天界面](docs/screenshots/companion-chat.jpg)

[查看最新版本](https://github.com/baihangyu486-blip/live2d-ai-pet/releases) · [版本记录](CHANGELOG.md)

## 陪你度过日常

| 入口 | 在这里 |
| --- | --- |
| **陪伴** | 聊天、图片与语音，收藏喜欢的话，查看心情与关系，打卡并开启主动陪伴。 |
| **回忆** | 翻阅与置顶记忆，阅读日记，回看日常片段和相伴里程碑。 |
| **角色** | 查看角色，自由导入、切换或停用 Live2D 形象。 |
| **设置** | 集中管理 AI 连接、角色、陪伴、记忆、聊天、声音与应用偏好。 |

## 选择喜欢的模样

![角色管理](docs/screenshots/companion-character.jpg)

Live2D 是可选的陪伴形象。没有模型，也可以聊天、保存回忆、写日记；切换形象时，人设和已有记录继续保留。

想添加形象时，先按[运行库安装说明](docs/runtime-setup.md)准备 Live2D Core，再到「角色 → 导入模型」选择自己的 `.model3.json`。模型与关联资源由你提供，详细要求见[模型使用说明](docs/model-import.md)。

## 开始相伴

当前发布 **v1.3.0-preview.1 源码预览版**，下载源码后按下面的方式开始使用。

安装 Node.js 与 pnpm，下载源码后在项目目录执行：

```powershell
pnpm install --no-frozen-lockfile
npm run start
```

首次启动，在「设置 → 连接」填写 AI 服务地址、密钥和模型并保存。语音与图片理解按所连接服务的能力使用；语音服务可在「设置 → 声音」配置。

关闭主窗口会收起到托盘，完全退出请使用托盘菜单或「设置 → 应用」。

## 关于项目

基于 Electron、Node.js、JavaScript、PIXI.js 与 Live2D。聊天、记忆和角色配置保存在本机；使用远程 AI 或语音服务时，相应内容会发送给你配置的服务。

[发布进度](docs/release-checklist.md) · [第三方许可](THIRD_PARTY_NOTICES.md)

源码许可证待确定；角色素材按各自授权使用。

## Author

**FuFu**
