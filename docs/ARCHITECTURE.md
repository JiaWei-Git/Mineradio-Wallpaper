# 架构

## 运行入口

- Wallpaper Engine 执行 `wallpaper/index.html`。
- `wallpaper/project.json` 声明元数据和 DIY 设置。
- 无构建步骤、无 Node.js、无 Electron、无网络服务。
- 目标运行时只加载本地 `Three.js r128`；上游 GSAP 保留在上游源码参考中，当前目标工程不加载。

## 1.0 发布层

发布层与壁纸运行时严格隔离：

```text
install.cmd
  -> installer/install.ps1
  -> wallpaper/ -> Wallpaper Engine projects/myprojects/mineradio-wallpaper
  -> 用户选择完整模式并明确确认风险
     -> 固定官方 BetterNCM Installer 1.2.0 + SHA-256
     -> third_party/inflink-rs/*.plugin + SHA-256 + 覆盖前备份
```

`wallpaper/index.html` 不引用 `installer/` 或 `third_party/`。安装器不会捆绑本机 `msimg32.dll`；修改后的 InfLink-rs 同时提供完整对应源码、补丁、许可证与哈希。云端测试使用临时假的 Wallpaper Engine/网易云目录验证复制、备份、完整模式与哈希，不声称在 GitHub 托管运行器上完成专有客户端联调。

## 数据流

```text
Wallpaper Engine callbacks
  -> we-adapter.js
  -> audio-reactor.js / media-history.js / lyrics-engine.js / properties.js / operation-log.js
  -> visual-state.js
  -> visual-core.js
  -> Three.js WebGL canvas
```

## 5.1 歌词与时间轴链路

5.1 将“取词”和“同步”拆成两条独立链路：

1. 取词链路：`mediaProperties -> media-history.js -> lyrics-engine.js -> 网易云/LRCLIB`。若媒体流派包含 `NCM-{id}`，`lyrics-engine.js` 直接用网易云 ID 请求歌词；否则按标题、歌手、专辑和时长评分匹配。
2. 同步链路：`mediaTimeline/mediaPlayback -> media-history.js -> lyrics-engine.js -> lyrics-visual.js`。只有 Wallpaper Engine 上报的 `position/duration` 被视为权威时间轴。

关键约束：

- `genres=NCM-{id}` 只能用于精确取词，不能替代真实 `position`。
- 任意 seek 必须表现为 `media.seek -> lyrics.seekSync -> lyrics.seekLine -> lyrics.line`。
- 切歌立即请求歌词；timer 只用于重试和补偿，不作为切歌取词主路径。
- `we-adapter.js` 会重试注册 WPE API，避免启动注入时序问题。
- WPE 最大化窗口暂停策略可能让视觉帧停止，但不会改变媒体时间轴日志；验证视觉时要确认 `stageFrameCount` 在增长。
- `media-history.js` 会输出网易云增强状态：`netease-enhanced`、`netease-zero-zero`、`netease-id-only`、`timeline-only`、`metadata-only`。这些状态只描述 Wallpaper Engine 当前收到的媒体能力，不会触发任何外部插件安装。

## 模块职责

| 文件 | 职责 |
| --- | --- |
| `we-adapter.js` | 注册音频、媒体、封面、播放、时间轴和设置回调；时间轴回调同时兼容对象签名和 `(position, duration, state)` 参数签名 |
| `audio-reactor.js` | 双声道 64 档频谱归一化、动态峰值、包络和实时节拍 |
| `media-history.js` | 当前歌曲状态、封面加载、原生时间轴和最近 9 首历史 |
| `lyrics-engine.js` | 网易云公开接口优先、LRCLIB 备用的匹配、缓存、LRC 解析和当前歌词行计算 |
| `lyrics-visual.js` | 可复用双槽 Three.js 歌词、扫光 shader、日冕、火花和歌词星河 |
| `operation-log.js` | 媒体、网易云增强状态、时间轴、歌词、设置和运行时异常的环形诊断日志、持久化、面板及复制导出 |
| `properties.js` | `project.json` 值的范围校验和内部字段映射 |
| `visual-state.js` | 封面色与自定义色调色板 |
| `visual-core.js` | Three.js 场景、粒子 shader、8 个预设、相机、转场、骷髅和歌单架 |
| `main.js` | 创建模块并连接事件，管理封面氛围背景和虚空本地素材层，不承载粒子算法 |

歌词请求只在歌曲标识或可用时长发生有效变化时触发。正向缓存保留 90 天，未找到结果只保留 10 分钟；缓存一次读入内存复用，写入时再同步 `localStorage`，上限 96 首或约 1.2 MB，避免壁纸长期使用后启动阶段反复解析大 JSON。使用标题、歌手、专辑和时长评分网易云搜索候选；网易云在 1.8 秒内失败或无同步歌词才转入 LRCLIB。LRCLIB 查询优先发 `/get` 精确匹配，并在短延迟后并行启动 `/search` 兜底。网络失败不会写负缓存，并自动重试两次。

播放位置使用 Wallpaper Engine 权威时间轴锚点与高精度时钟插值。时间轴可从专用 timeline 回调进入，也会检查媒体属性和播放事件中是否携带原生位置字段。每个位置包都与上一锚点的预测位置比较；差值超过动态阈值时增加 `seekRevision`，歌词立即二分定位到目标行并清空旧句过场。输入兼容官方 `position/duration`，并容纳常见大小写、毫秒、百分比、100ns tick 和嵌套字段。`position=0,duration=0` 判为不可用；已有有效锚点时，后续坏包会被忽略。

歌词引擎在 `timeline`、`seek`、`timelineUnavailable`、`timelineIgnored` 和 `playback` 事件里都会立即校准 fallback 时钟，并在已有歌词时通知视觉层。原生时间轴是会话级能力，一旦获得有效锚点就持续有效；官方允许回调不规则触发，因此不再按短时超时废弃锚点。没有任何位置事件时，用户可选择估算滚动、静态首行或自动隐藏。播放状态只能冻结或续接估算时钟，不能推断拖动后的目标秒数。

歌词文本保持网易云或 LRCLIB 返回的原文，不做本地简繁转换。

操作日志默认关闭、诊断面板默认隐藏。关闭时不读取历史日志，也不为高频时间轴事件构造原始字段采样；开启后才从 `localStorage` 的 `mineradio.we.operationLog.v1` 懒加载，最多保留 240 条且序列化上限约 180 KB；超过限制自动淘汰最旧记录。时间轴普通事件每 5 秒最多记录一次，跳听即时记录，并采样记录原始字段名、原始 position/duration，便于区分秒、毫秒、100ns tick 或坏 `0/0` 会话；不记录 30 FPS 音频频谱、封面 Base64 或完整歌词正文。高级设置可以开启持久化，或显示面板并点击“复制日志”。诊断面板顶部显示当前网易云增强状态和处理建议。运行时还监听 `error` 和 `unhandledrejection`，用于捕获 Wallpaper Engine CEF 中仅在真实桌面出现的异常。

歌词视觉只维护两套可复用 CanvasTexture 和固定几何体。当前行与离场行交叉使用，避免每句歌词创建并销毁整套 GPU 资源；逐帧只更新进度、透明度、少量 uniform 和 132 个火花坐标。字体、字重、字距、行距、主色、高亮、溢光联动/独立色、鼓点响应、火花与星河默认值以 `upstream-mineradio/public/index.html` 的 3.3 参数为基准。

没有歌手字段时会尝试解析 `歌手 - 歌名`，仍缺歌手时改用高阈值标题搜索。没有媒体时间轴或只有纯文本歌词时，用户可选择估算滚动、静态首行或自动隐藏。歌词偏移在播放位置计算阶段统一应用。

渲染循环遵守 Wallpaper Engine 下发的 `fps` 通用属性；当桌面设置为 30 FPS 或更低时，`visual-core.js` 会在 `requestAnimationFrame` 入口限帧，避免 CEF 仍按显示器刷新率满速执行。`performanceQuality` 继续控制 DPR 上限和像素预算，`adaptiveIdle` 只处理后台隐藏场景。

逐帧热路径不复制完整视觉状态：`visual-core.js` 只读稳定的属性/调色板引用并复用相机音频对象；`audio-reactor.js` 复用频段、节拍和渲染帧对象；`lyrics-visual.js` 只在样式或调色板变化时重建文字样式与颜色。公开快照接口仍返回副本，诊断和测试代码不会持有被下一帧改写的数据。运行包和默认启动载荷的体量预算由回归测试强制约束，详见 `docs/OPTIMIZATION_AUDIT.md`。

## 视觉预设

内部编号保持上游并扩展 3.0：`0 Emily`、`1 隧道`、`2 球体`、`3 虚空`、`4 唱片`、`5 星河`、`6 骷髅`、`7 经典平面点云`。

主粒子共用封面采样纹理和边缘/深度辅助纹理。暗魂骷髅使用独立二进制点云，并在用户切到骷髅预设时才懒加载 `skull-decimation-points.bin`，避免默认启动预读 1MB 点云和创建对应几何；加载后在本会话复用。星河使用主粒子 shader 的独立空间分布，并可单独调粒子密度和 Z 轴景深。虚空默认纯黑，可选择本地图片或视频作为轻量背景层；Web 壁纸不直接启动另一个 Wallpaper Engine 工程。

`backgroundColorMode = cover` 不直接铺纯色，而是把 `visual-state.js` 的封面主色、辅色和深色传给 `main.js`，生成多层径向环境光，再经 CSS 模糊、饱和、压暗和暗角处理。经典平面点云与 Emily 会自动使用更低背景不透明度。

## 媒体历史歌单架

媒体属性变化生成歌曲键，封面异步加载后回填对应条目。历史仅保存在当前壁纸会话，不写磁盘、不联网。当前卡片渲染由 `visual-core.js` 的 `cardCanvas`、`setHistory` 和 `updateShelf` 完成。3.0 已从竖向封面卡改为上游 PSP 风格横向卡片架：中心卡突出、侧边卡后退、舞台模式横向展开、歌单架区域滚轮切换中心卡。`setHistory` 使用历史签名避免设置变化时反复销毁重建；`main.js` 不再让时间轴、跳听和播放状态事件刷新历史卡片或 CSS 背景，只有曲目、封面、调色板和设置变化才触发视觉状态同步。点击卡片会居中并临时把历史封面召回到点云视觉，但 Wallpaper Engine 媒体监听本身不提供任意历史歌曲反控播放接口。

## 验证边界

自动 WPE 弹出窗口不会收到真实桌面媒体历史，因此可以验证 8 个预设和镜头，但不能完整验证真实历史卡片。歌单架数据模型由 Node 回归测试覆盖，最终视觉仍需导入桌面后连续切换歌曲检查。

## 路径陷阱

本机 Wallpaper Engine 命令行会错误解码中文绝对路径。`tests/wpe-visual-regression.ps1` 会复制 `wallpaper/` 到工作区临时 ASCII 路径，验证结束后删除。不要把直接加载中文路径失败误判成 WebGL 黑屏。
