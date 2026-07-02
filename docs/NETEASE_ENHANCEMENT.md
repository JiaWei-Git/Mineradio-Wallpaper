# 网易云增强同步说明

## 结论

壁纸运行时不会检测网易云安装路径、安装插件或注入 DLL，也不应该静默安装插件。1.0 GitHub 发布包在壁纸之外提供独立安装器；只有用户主动运行、选择完整模式并输入 `INSTALL` 同意风险后，安装器才处理 BetterNCM 与 InfLink-rs。

歌词获取本身不依赖插件：壁纸会优先请求网易云公开歌词接口，失败时用 LRCLIB 备用。插件只用于增强网易云媒体会话，让 Wallpaper Engine 收到更准确的 `NCM-{id}` 和真实 `position/duration`。没有这个增强时，歌词仍可显示，但拖动网易云进度条后的精准跟随取决于播放器是否向 Wallpaper Engine 提供有效时间轴。

## 用户模式

| 状态 | 壁纸表现 | 用户处理 |
| --- | --- | --- |
| `netease-enhanced` | 有 `NCM-{id}` 且有真实 `position/duration`；取词快，seek 后歌词跟随 | 无需处理 |
| `netease-zero-zero` | 有 `NCM-{id}`，但时间轴是 `0/0`；通常是网易云原生 SMTC 覆盖增强会话 | 关闭网易云原生“开启 SMTC”，保留 InfLink-rs 增强会话，重启网易云 |
| `netease-id-only` | 已识别网易云 ID，但暂未收到可用时间轴 | 检查 InfLink-rs 是否启用，确认没有坏 SMTC 会话覆盖 |
| `timeline-only` | 有普通媒体时间轴，但没有网易云 ID | 可同步播放/跳转；取词靠标题歌手匹配 |
| `metadata-only` | 只有标题歌手，没有真实时间轴 | 可显示歌词；无时间轴时按用户设置估算、静态或隐藏 |

这些状态会在“高级性能 -> 保留诊断日志 -> 显示诊断面板”里显示，也会写入可复制日志。

## 推荐给公开用户的最快启用路径

1. 下载并完整解压 GitHub Release，双击 `install.cmd`。
2. 只要求显示歌词时选择“仅安装壁纸”；该模式不修改网易云。
3. 要求拖动进度条后精准跟随时选择“完整安装”，阅读风险说明并输入 `INSTALL`。
4. 安装器固定 BetterNCM Installer 1.2.0 的官方地址与 SHA-256；InfLink-rs 覆盖前自动备份并在复制后再次校验。
5. 重启网易云音乐，再在 Wallpaper Engine 高级性能里打开诊断面板确认状态为 `netease-enhanced`。若仍出现 `netease-zero-zero`，关闭网易云原生“开启 SMTC”后重启。

## 风险边界

BetterNCM / InfLink-rs 属于第三方播放器插件链路，涉及未签名 DLL 注入或修改播放器前端运行环境，可能触发杀毒软件、在播放器升级后失效或导致客户端无法启动。壁纸只读取 Wallpaper Engine 已暴露的媒体信息；仓库外层安装器负责固定来源、哈希、备份和明确确认，不会静默运行。

发布包的 InfLink-rs 基于上游 v3.2.11，只修改 manifest 以同时匹配旧 `vendors~app~subApp.chunk` 和网易云 3.1.36 的 `app.chunk`。两个原生 DLL、`index.js` 和预览图与官方原包逐项哈希一致。对应源码、补丁与许可位于 `third_party/inflink-rs/`。
