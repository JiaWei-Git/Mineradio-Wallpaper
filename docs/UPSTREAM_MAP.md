# 上游来源映射

上游仓库：`../../upstream-mineradio`

许可证：GNU GPL v3

主要视觉来源：`../../upstream-mineradio/public/index.html`

## 5.1 网易云增强会话外部修复

壁纸代码不安装、不注入播放器插件；但 2026-07-02 的真实网易云 seek 验证依赖用户批准的 InfLink-rs 外部增强会话。

本机网易云 3.1.36 使用 `orpheus://orpheus/pub/hybrid/app.chunk`。已发布的 InfLink-rs 3.2.11 manifest 只匹配旧 `vendors~app~subApp.chunk` 时，网易云原生 `0/0` SMTC 会话会覆盖增强会话，导致 WPE 收不到真实时间轴。

热修参考上游 `apoint123/inflink-rs@main` manifest，将两个路径都加入：

- `orpheus://orpheus/pub/hybrid/vendors~app~subApp.chunk`
- `orpheus://orpheus/pub/hybrid/app.chunk`

这不是壁纸运行时代码的一部分。1.0 发布包把修订二进制、完整对应源码、补丁、GPL 许可证和哈希放在 `third_party/inflink-rs/`，由仓库外层安装器在用户明确确认后安装；壁纸侧仍只读取 Wallpaper Engine 暴露的媒体属性和时间轴。

## 已确认区域

| 系统 | 上游位置/标识 | 迁移目标 |
| --- | --- | --- |
| 全局视觉参数 | `fxDefaults`，约 3196 行 | `wallpaper/js/visual-core.js`、`properties.js` |
| 粒子指针惯性 | `updateParticlePointerFrame`，约 5555 行 | `visual-core.js` |
| 封面粒子网格 | `GRID_X`、`applyCoverParticleResolution`，约 5704 行 | `visual-core.js` |
| 骷髅粒子 | `createSkullParticleLayer`、`updateSkullParticleLayer`，约 6661 行 | `visual-core.js` |
| 封面深度 | `setCoverDepthCache`、`applyCoverCanvas`，约 9447 行 | `visual-core.js` |
| 3D 歌单架 | 约 12863-14817 行 | `visual-core.js`、`media-history.js` |
| 预设切换 | `setPreset`，约 21262 行 | `visual-core.js` |
| 粒子拖动 | `applyParticleSpinDrag`，约 24782 行 | `visual-core.js` |
| 舞台歌词 | `stageLyrics`、`makeLyricMask`、`buildLyricMesh`、`tickLyricsParticles`，约 7204-9344 行 | `lyrics-engine.js`、`lyrics-visual.js` |
| 歌词默认参数 | `fxDefaults` 的 `lyric*` 字段，约 3200-3225 行 | `properties.js`、`project.json` |
| 歌词调色 | `lyricPaletteFromHex`、`effectiveLyricPalette`、`setStageLyricPalette`，约 8221-8325 行 | `lyrics-visual.js` |

## 资源

| 上游资源 | 目标 | 状态 |
| --- | --- | --- |
| `public/vendor/three.r128.min.js` | `wallpaper/vendor/` | 已复制 |
| `public/assets/skull-decimation-points.bin` | `wallpaper/assets/` | 已复制 |

## 必要适配

- 原版 `AudioContext/AnalyserNode` 输入替换为 `wallpaperRegisterAudioListener`。
- 原版播放器歌曲对象替换为 Wallpaper Engine 媒体属性及封面回调。
- 原版实时播放列表替换为当前会话的媒体播放历史。
- 原版 `localStorage` DIY 控制台替换为 `project.json` 静态属性。
- 原播放器歌曲 ID 替换为标题、歌手、专辑和时长的网易云公开搜索评分；舞台歌词进入独立渲染模块。
- 原软件歌词来源替换为网易云公开歌词接口，LRCLIB 只作备用；歌词文本保持来源原文。
- 原播放器连续播放位置替换为 Wallpaper Engine 原生时间轴锚点；新增 `seekRevision` 适配用户前后跳听。时间轴输入统一兼容秒、毫秒、百分比、WinRT/SMTC 100ns tick、大小写变体和 `timeline.*` 嵌套字段。`0/0` 时间轴判为不可用；已有好锚点后混入的坏包会被忽略。

## 已完成适配

- 原版预设编号 `0-6` 已保持：Emily、隧道、球体、虚空、唱片、星河、骷髅。3.0 新增编号 `7`：旧版经典平面点云。
- Emily、隧道、球体、虚空、唱片、星河沿用原版粒子几何和 shader 参数。
- 骷髅直接读取原版每点 5 个 `Float32` 的二进制资源，并沿用原版骨骼分区、下颌、灯光和脉冲逻辑。
- 原版频谱整形保留动态峰值、attack/release 和分预设频段隔离；输入改为 Wallpaper Engine 的 64 档双声道频谱。
- 3D 歌单架的数据改为当前会话最近 9 首媒体历史，当前歌曲位于首位，封面加载完成后回填对应历史卡片。3.0 已迁入上游约 13075-13460 行的横向卡片绘制和 PSP 弧形布局思路，但仍未完整接入二级内容框和全部悬停状态。

## 已知环境差异

- Wallpaper Engine 不提供原播放器的完整 PCM 时域数据与离线 beat map，因此不能照搬 `OfflineAudioContext` 预分析；壁纸使用实时系统频谱。
- Wallpaper Engine 的媒体时间轴是播放器可选能力。播放器不提供位置时，壁纸只能按播放/暂停状态维护估算时钟，无法知道用户 seek 的目标秒数。
- 网易云与 LRCLIB 主要提供逐行 LRC；没有逐字时间戳时沿用原版 LRC 平滑扫光降级。
- Wallpaper Engine 命令行在本机不能正确解码含中文的项目绝对路径。自动验证会临时复制到工作区纯 ASCII 路径，验证后删除；源码目录不变。

## 尚未一比一的部分

- 3D 歌单架：卡片材质和主布局已接近原版；尚缺展开/关闭状态、二级内容框、完整悬停选中和 GSAP 过渡。
- 骷髅：二进制点云和核心下颌/灯光已迁移，但 shader 仍是精简适配版，需逐段对照上游完整实现。
- 相机：已支持拖动、惯性、滚轮和预设构图，但未完整搬入原版 cinema、free camera、beat camera 状态机。
- 切歌：已有封面混合、加载雾和切歌涟漪；尚未逐段对齐原版全部时序与镜头分支。
- DIY：已暴露壁纸中有意义的静态视觉项；原版动态存档、导入导出和播放器专属项不属于 Wallpaper Engine 设置面板。
