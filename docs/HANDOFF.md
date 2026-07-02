# 开发交接

交接日期：2026-07-02

## 当前主线

`MR 5.1歌词完整版/` 是唯一开发主线，也是 `Mineradio Wallpaper 发布版 1.0` 的 GitHub 源码根目录。它合并了 3.3 的网易云精确 ID 能力与 5.0 的原生 Wallpaper Engine 时间轴架构。

不要继续在旧 3.3 或 5.0 包上开发。旧来源已合并并从工作区删除。

## 已完成

- 8 个视觉预设、3D 歌单架、自由镜头、舞台歌词、中文设置、性能档位。
- 网易云公开歌词接口优先，LRCLIB 备用。
- `genres=NCM-{id}` 直取网易云歌词，避免搜索误匹配。
- Wallpaper Engine `mediaProperties/mediaTimeline/mediaPlayback` 统一进入 `media-history.js`。
- WPE API 注册重试，解决桌面启动时 API 注入时序导致无媒体事件的问题。
- 切歌立即 `lyrics.request`，解决高频 timeline 反复 reschedule 导致取词 timer 饥饿的问题。
- 任意 seek 后 `media.seek -> lyrics.seekSync -> lyrics.seekLine -> lyrics.line` 链路已在真实桌面验证。
- 可复制操作日志，包含 adapter 注册、媒体时间轴、取词耗时、seek 行号和视觉行切换。
- 诊断面板显示网易云增强状态：`netease-enhanced`、`netease-zero-zero`、`netease-id-only`、`timeline-only`、`metadata-only`，用于公开用户自查插件/时间轴能力。
- 操作日志关闭时不再读取历史日志或构造高频 timeline 调试采样；歌词缓存改为一次加载内存复用，上限 96 首或约 1.2 MB。
- 暗魂骷髅点云改为切到骷髅预设时懒加载，默认启动不再预读 1MB 点云资源。
- 新增公开发布层：`install.cmd`、`installer/`、`third_party/`、`scripts/` 和 `.github/workflows/`，不进入 Web Wallpaper 运行时。
- 完整安装模式固定 BetterNCM Installer 1.2.0 官方地址和 SHA-256；InfLink-rs 覆盖前备份、复制后校验，并要求用户输入 `INSTALL` 同意未签名 DLL 风险。
- InfLink-rs v3.2.11 修订包附带完整对应源码、可应用补丁、GPL 许可证、原包/修订包哈希；经逐项比较只有 `manifest.json` 与官方原包不同。
- GitHub Release 构建会把最终 ZIP 解压到临时目录，逐项校验壁纸、插件、源码包和发布清单。

## 关键外部状态

当前机器已验证的网易云链路：

- 只剩一个 `cloudmusic.exe` SMTC 会话。
- 会话包含 `genres=NCM-{id}`。
- 会话提供真实 `position/duration`。

InfLink-rs 外部热修：

- 备份：`C:\betterncm\plugins\InfLink-rs.plugin.backup-20260702`
- 原包 SHA256：`F437B6ECDA3915C147E5E195F4F5DAE4C4A7534A8F8B46EAE8636C401BF956F3`
- 修后 SHA256：`9154B5BB666FD1E72A0F788F4405A1A00C6DE418BFE7B74C30B5036CC26E9F57`
- 修复点：manifest 同时匹配旧 `vendors~app~subApp.chunk` 和网易云 3.1.36 使用的 `app.chunk`。

这属于播放器侧增强，不属于壁纸项目代码。壁纸仍不能静默安装或更新插件。

公开用户不安装插件也能取词；如果需要网易云拖动进度条后歌词精准跟随，应从 GitHub Release 运行 `install.cmd` 并选择完整模式。安装器要求显式确认风险，安装后若仍出现 `0/0` 会话，再关闭网易云原生“开启 SMTC”。详细说明见 `docs/NETEASE_ENHANCEMENT.md`。

## 真实桌面验证结论

2026-07-02 验证：

- 切歌 `This Moment - Able Heart`：网易云 ID `2662419446`，取词 `330 ms`，48 行同步歌词。
- 跳 30 秒：`lyrics.seekLine index=7`，视觉层 `lyrics.line index=7`。
- 跳 120 秒：`lyrics.seekLine index=42`，视觉层 `lyrics.line index=42`。
- 跳 60 秒：`lyrics.seekLine index=19`，视觉层 `lyrics.line index=19`。
- 截图证据：`test-output/wpe/desktop-render-lyrics-visible.png`。

注意：Wallpaper Engine 用户设置 `playbackmaximized=pause` 时，Codex 或其它最大化窗口会让渲染循环暂停，媒体 timeline 仍会进日志，但视觉层不刷新。验证视觉时需要临时改为 `run` 或确保桌面未被最大化窗口覆盖。最终应恢复用户性能设置。

## 必跑验证

```powershell
cd "E:\codex\WALLPAPER MINERADIO\MR 5.1歌词完整版"
Get-ChildItem wallpaper\js -Filter *.js | ForEach-Object { node --check $_.FullName }
node tests\regression.test.js
node -e "JSON.parse(require('fs').readFileSync('wallpaper/project.json','utf8'))"
node tests\live-lyrics-check.js
powershell -ExecutionPolicy Bypass -File tests\wpe-visual-regression.ps1
powershell -ExecutionPolicy Bypass -File tests\release-installer.test.ps1
powershell -ExecutionPolicy Bypass -File scripts\build-release.ps1 -VerifyOnly
```

2026-07-02 全项目轻量化改动已通过语法、逻辑、联网取词和 WPE 图形回归。WPE 回归脚本同时修正了两项旧验证缺陷：预览创建后主动发送 `play`，避免 `playbackmaximized=pause` 产生全黑抓帧；`applyProperties` 改用官方要求的直接属性值 JSON，不再错误包装 `{ value: ... }`。最终报告对 8 个预设、近/远镜头、歌单架以及隧道、球体、星河、骷髅的结构特征执行强断言，见 `test-output/wpe/report.json`。

此前通过验收的 5.1 `wallpaper/` 已同步到 `D:\Steam\steamapps\common\wallpaper_engine\projects\myprojects\index` 并在 `Monitor0` 运行。当前 GitHub 发布主线只调整了 `project.json` 的标题与简介，视觉、媒体和歌词代码未变；因此安装目录与发布主线不再逐文件完全一致，发布任务按用户要求不重复覆盖现有本地安装。

## 工作区清理状态

当前根目录只保留：

- `MR 5.1歌词完整版/`：唯一开发主线。
- `upstream-mineradio/`：只读上游源码。
- `AGENTS.md`：工作区规则。

用户另存的 `MR 5.1歌词完整版.rar` 是工作区外层备份，不属于 GitHub 仓库、运行包或 Release 资产，不自动删除。

旧 `MR 3.3歌词完整版/`、`MR 5.0原生歌词同步版.rar`、`.tmp/` 和空隐藏目录已删除。
