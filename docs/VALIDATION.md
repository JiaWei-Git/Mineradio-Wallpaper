# 验证记录

## Mineradio Wallpaper 发布版 1.0 本地发布验证

日期：2026-07-02

发布层新增内容：

- `install.cmd` 与 `installer/install.ps1`：扫描 Steam 库、备份旧壁纸、逐文件校验并安装。
- 完整模式只有在用户输入 `INSTALL` 或非交互显式传入 `-AcceptUnsignedPluginRisk` 后才继续；风险确认前不写入壁纸或插件目录。
- BetterNCM Installer 固定为官方 1.2.0 和 SHA-256 `F4AABE8FBC09BB78AD66AAA28DBD26F2FB01D782CBA0611152CF8F5CC6CB1468`。
- InfLink-rs 修订包 SHA-256 为 `9154B5BB666FD1E72A0F788F4405A1A00C6DE418BFE7B74C30B5036CC26E9F57`，附带完整对应源码、补丁和 GPL 许可证。
- GitHub Release 构建会重新解压资产并逐项验证壁纸、插件、源码包和发布清单。

本地已通过：JavaScript 与 PowerShell 语法、`tests/regression.test.js`、`project.json`、`tests/release-installer.test.ps1`、`scripts/build-release.ps1 -VerifyOnly`。当前 `wallpaper/` 为 18 个文件、3,819,221 bytes；默认启动载荷 871,294 bytes。实际 Release ZIP 为 5,727,477 bytes，本地构建 SHA-256 为 `55401EE638882D587247D3C21E5762975131535A8CC3A85CD2B931416A99A8B7`；构建清单包含 UTC 时间，因此云端产物哈希可不同，必须以同一 Release 附带的 `SHA256SUMS.txt` 为准。

本地联网探针因 Codex 执行额度限制未能在本轮重跑，未绕过限制。最终 GitHub Actions 云端验证已于 2026-07-02 通过：[CI run 28576519046](https://github.com/JiaWei-Git/Mineradio-Wallpaper/actions/runs/28576519046)。`Windows core and installer` 作业中的语法、回归、JSON、安装器沙盒和 Release 解压校验全部成功；`Live lyrics providers` 作业中的网易云与 LRCLIB 只读联网探针成功。对应提交为 `0a793a0802ddbf2d23c2274147cf718855af4d68`。工作流已使用 `actions/checkout@v7` 与 `actions/setup-node@v6`，两个作业均无检查注释或 Node 20 弃用告警。

云端没有 Steam、Wallpaper Engine 和网易云客户端，只能验证源码、安装器沙盒、联网取词与 Release 完整性，不能替代此前已通过的 WPE CEF 图形回归和真实桌面 SMTC 日志。

## 5.1 公开分发与轻量化补丁验证

日期：2026-07-02

### 修复点

- `media-history.js` 增加网易云增强状态判定，区分 `netease-enhanced`、`netease-zero-zero`、`netease-id-only`、`timeline-only` 和 `metadata-only`。
- `operation-log.js` 诊断关闭时不读取历史日志；诊断开启后才懒加载 `localStorage`，面板顶部显示增强状态和处理建议。
- `media-history.js` 只有诊断开启时才为高频时间轴事件构造原始字段采样，默认运行减少无用对象创建。
- `lyrics-engine.js` 歌词缓存改为一次读入内存复用，上限从 180 首 / 约 3 MB 收敛到 96 首 / 约 1.2 MB。
- `visual-core.js` 暗魂骷髅点云从启动即加载改为切到骷髅预设时懒加载，默认首屏不再预读 1MB 点云。
- 新增 `docs/NETEASE_ENHANCEMENT.md`，明确壁纸不会自动安装 BetterNCM/InfLink-rs，也不会静默注入播放器。

### 命令验证

```powershell
Get-ChildItem wallpaper\js -Filter *.js | ForEach-Object { node --check $_.FullName }
node tests\regression.test.js
node -e "JSON.parse(require('fs').readFileSync('wallpaper/project.json','utf8'))"
```

结果：前三项工作区验证通过，回归输出 `Mineradio 5.1 lyrics regression tests passed`。

本轮涉及视觉加载逻辑，按规则还需要补跑：

```powershell
powershell -ExecutionPolicy Bypass -File tests\wpe-visual-regression.ps1
```

该阶段最初尝试启动 WPE 图形回归时曾受执行额度限制；后续全项目轻量化验收已成功补跑，最新结果见下方“全项目轻量化与强视觉回归”。

## 全项目轻量化与强视觉回归

日期：2026-07-02

### 运行体量

- `wallpaper/`：18 个文件，3,819,199 bytes（3.642 MiB）。
- 默认页面启动载荷：871,272 bytes（0.831 MiB）。
- 业务 JavaScript：244,545 bytes。
- 预览图无损重压缩：1,974,708 -> 1,899,607 bytes，像素逐点一致。

### 自动验证

```powershell
Get-ChildItem wallpaper\js -Filter *.js | ForEach-Object { node --check $_.FullName }
Get-ChildItem tests -Filter *.js | ForEach-Object { node --check $_.FullName }
node tests\regression.test.js
node -e "JSON.parse(require('fs').readFileSync('wallpaper/project.json','utf8'))"
node tests\live-lyrics-check.js
powershell -ExecutionPolicy Bypass -File tests\wpe-visual-regression.ps1
```

结果：

- JavaScript 与 PowerShell 脚本语法通过。
- 回归输出：`Mineradio 5.1 lyrics regression tests passed`。
- 网易云联网探针：`Die For You` 73 行 / 400 ms；`Somebody To You` 75 行 / 329 ms。
- WPE CEF：8 个预设产生 8 个不同帧；`void + black` 按设计为空；隧道、球体、星河和骷髅结构断言通过；近/远镜头帧不同；歌单架非空。
- 报告：`test-output/wpe/report.json`。
- 实际安装目录：`D:\Steam\steamapps\common\wallpaper_engine\projects\myprojects\index`，18/18 文件与工作区逐项 SHA-256 一致；`Monitor0` 当前选中该目录的 `index.html`。

### 验证脚本修正

旧脚本把 CLI 属性包装成 `{ "value": ... }`，而 Wallpaper Engine `applyProperties` 要求直接属性值，导致旧截图可能只因动画时间不同而哈希不同。现已改为直接 JSON，并增加结构范围断言。另在预览创建和属性应用后发送官方 `play` 控制，避免用户的 `playbackmaximized=pause` 策略让后台预览输出全黑帧。

## 5.1 真实网易云歌词同步验收

日期：2026-07-02

### 修复点

- InfLink-rs manifest 热修后，网易云 3.1.36 的增强 SMTC 会话恢复，`genres` 提供 `NCM-{id}`，`position/duration` 不再是 `0/0`。
- `we-adapter.js` 改为幂等重试注册 Wallpaper Engine 媒体 API，避免 API 注入稍晚时永久收不到媒体事件。
- `lyrics-engine.js` 切歌后立即取词，不再依赖会被高频 timeline 重排饿死的短延迟 timer。
- `lyrics-engine.js` 记录 `lyrics.readyLine` 与 `lyrics.seekLine`，`lyrics-visual.js` 记录 `lyrics.visualState` 与 `lyrics.line`，用于确认状态机和视觉层同步。
- `wpe-visual-regression.ps1` 改为抓 `Chrome_RenderWidgetHostHWND` 渲染子窗口，避免 CEF 顶层窗口 `PrintWindow` 黑帧；Void 断言改为非空与差异性验证。

### 命令验证

```powershell
Get-ChildItem wallpaper\js -Filter *.js | ForEach-Object { node --check $_.FullName }
node tests\regression.test.js
node -e "JSON.parse(require('fs').readFileSync('wallpaper/project.json','utf8'))"
node tests\live-lyrics-check.js
powershell -ExecutionPolicy Bypass -File tests\wpe-visual-regression.ps1
```

结果：

- 回归输出：`Mineradio 5.1 lyrics regression tests passed`。
- 联网探针：
  - `Die For You`：网易云 `442867526`，73 行，约 361 ms。
  - `Somebody To You`：网易云 `28845022`，75 行，约 343 ms。
- WPE 视觉回归通过，8 个预设、近/远镜头和舞台歌单架均非空且有差异，报告输出到 `test-output/wpe/report.json`。

### 真实桌面日志验收

验证环境：Wallpaper Engine 桌面 Web wallpaper + 网易云音乐 + InfLink-rs 增强 SMTC。

取词：

```text
02:14:58  media.track {"title":"This Moment","artist":"Able Heart","neteaseId":"2662419446"}
02:14:58  lyrics.request ...
02:14:59  lyrics.result {"status":"ready","provider":"netease","elapsedMs":330,"lines":48,"synced":true}
02:14:59  lyrics.readyLine {"index":2,"position":0.7}
02:14:59  lyrics.line {"index":2,"position":0.7}
```

跳转：

```text
02:15:36  media.seek {"to":30,"duration":148,"revision":2}
02:15:36  lyrics.seekLine {"index":7,"position":30.7}
02:15:36  lyrics.line {"index":7,"position":30.7}

02:15:39  media.seek {"to":120,"duration":148,"revision":3}
02:15:39  lyrics.seekLine {"index":42,"position":120.7}
02:15:39  lyrics.line {"index":42,"position":120.7}

02:15:43  media.seek {"to":60,"duration":148,"revision":4}
02:15:43  lyrics.seekLine {"index":19,"position":60.7}
02:15:43  lyrics.line {"index":19,"position":60.7}
```

截图证据：`test-output/wpe/desktop-render-lyrics-visible.png`。

注意：WPE 设置 `playbackmaximized=pause` 时，最大化窗口会暂停渲染循环，导致 `stageFrameCount` 很低、视觉层不刷新，但媒体 timeline 仍会记录。这是 WPE 性能策略，不是歌词同步失败。

## 5.0 原生歌词同步重构

日期：2026-07-01

### 根因复盘

真实桌面表现为：歌词能随播放推进，暂停后也能准确冻结，但拖动播放器进度条后仍按旧进度继续。这三种现象并不矛盾：播放和暂停只需要状态回调，本地高精度时钟即可维持；跳到任意目标行必须额外收到播放器的真实 `position`。

4.x 多次修改了歌词二分定位、seek 阈值、字段别名和视觉转场，但这些措施只能处理“已收到位置”的情况，无法补出播放器没有上报的目标秒数。Wallpaper Engine 官方文档同样注明 `MediaTimelineListener` 是可选事件，不是所有播放器都支持：

- https://docs.wallpaperengine.io/en/web/audio/media.html
- https://docs.wallpaperengine.io/en/scene/scenescript/reference/class/MediaTimelineEvent.html

### 5.0 处理

- 删除所有外部网易云插件、DLL 注入、歌曲 ID 流派标记和自定义时间轴暗号的运行时代码与测试契约。
- 保留网易云公开搜索/歌词接口和 LRCLIB 备用源，两者都不依赖播放器插件。
- 原生时间轴统一从专用 timeline 回调、媒体属性和播放事件原始载荷接收。
- 修正空值数值化问题，避免缺失字段被错误识别为 `0`。
- 有效时间轴锚点不再按 4.5 秒过期，适配官方所说的“不规则触发”。
- 首个远端位置与当前锚点差异超过 1.5 秒时也按 seek 处理。
- 任何 seek 都更新 `seekRevision`，歌词引擎直接二分定位，视觉层重置旧句过场。
- 没有位置时明确使用估算、静态或隐藏降级，不声称具备真实 seek 同步。

### 自动回归

覆盖内容：

- timeline 对象签名与位置参数签名。
- 秒、毫秒、百分比、100ns tick、嵌套字段和坏 `0/0` 包。
- timeline、媒体属性、播放事件三入口位置同步。
- 前跳到第 4 行、后跳到第 1 行及整条订阅链即时更新。
- 稀疏时间轴超过 4.5 秒后仍保持权威锚点。
- 无时间轴时估算时钟随播放推进、暂停冻结。
- 普通流派元数据不会被误识别为时间轴。
- 网易云搜索后取词与 LRCLIB 降级、缓存、候选评分。

执行命令：

```powershell
Get-ChildItem wallpaper/js -Filter *.js | ForEach-Object { node --check $_.FullName }
node tests/regression.test.js
node -e "JSON.parse(require('fs').readFileSync('wallpaper/project.json','utf8'))"
```

结果：全量 JavaScript 语法通过，回归输出 `Mineradio 5.0 native lyrics regression tests passed`，`project.json` 解析通过。

只读联网探针通过：`Die For You - The Weeknd` 命中网易云 ID `442867526`，73 行，耗时 360 ms；`Somebody To You - The Vamps` 命中 ID `28845022`，75 行，耗时 378 ms。两首歌都经过公开搜索后再取词，不使用外部插件提供的歌曲 ID。

### 真实桌面验收

自动测试能证明“只要收到目标 position 就一定跳到对应歌词行”，不能替代播放器能力验证。真实验收时开启智能日志：

1. 播放后前跳 30 秒、后跳 20 秒。
2. 检查是否出现 `media.timeline` 与 `media.seek`。
3. 若日志有正确目标位置而歌词未跳，属于 5.0 代码缺陷。
4. 若完全没有位置事件，属于当前播放器未向 Wallpaper Engine 提供 timeline，纯 Web 壁纸没有可用目标时间。

本轮未写入 C 盘，也未安装或调用任何外部网易云插件。
