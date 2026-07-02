# Mineradio Wallpaper 发布版 1.0

[![CI](https://github.com/JiaWei-Git/Mineradio-Wallpaper/actions/workflows/ci.yml/badge.svg)](https://github.com/JiaWei-Git/Mineradio-Wallpaper/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/JiaWei-Git/Mineradio-Wallpaper)](https://github.com/JiaWei-Git/Mineradio-Wallpaper/releases/latest)
[![License](https://img.shields.io/badge/license-GPL--3.0-blue.svg)](LICENSE)

面向 Wallpaper Engine 的轻量 Web Wallpaper。它保留 Mineradio 的 3D 音频视觉、舞台歌词、媒体历史歌单架和中文 DIY 设置；歌词优先读取网易云公开接口，LRCLIB 备用。

## 下载与安装

从 [最新 Release](https://github.com/JiaWei-Git/Mineradio-Wallpaper/releases/latest) 下载 `Mineradio-Wallpaper-v1.0.0.zip`，完整解压后双击：

```text
install.cmd
```

安装器提供两种模式：

1. **完整安装**：安装壁纸，并按需安装 BetterNCM + 本项目验证过的 InfLink-rs 增强包。
2. **仅安装壁纸**：不修改网易云音乐，歌词仍可获取；拖动进度后的精准跟随取决于播放器是否提供有效时间轴。

完整模式会加载未签名的第三方 DLL。安装器不会静默执行：它会显示风险说明，只有用户输入 `INSTALL` 后才继续。详细步骤、兼容范围和故障排查见 [安装教程](docs/INSTALLATION.md)。

## 功能

- 8 个视觉预设：经典平面点云、Emily、隧道、球体、虚空、唱片、星河、暗魂骷髅。
- Wallpaper Engine 系统频谱驱动的节拍、能量、粒子、镜头和封面响应。
- MINERADIO 3D 舞台歌词：渐变扫光、描边、日冕、火花、歌词星河和双槽转场。
- 网易云公开搜索/歌词接口优先，LRCLIB 备用；支持 `NCM-{id}` 精确取词。
- 原生 `position/duration` 时间轴、暂停、恢复、切歌及任意 seek 二分定位。
- 最近 9 首媒体历史构成的 3D 横向歌单架。
- 中文 Wallpaper Engine 属性面板、性能档位、镜头、颜色、歌词与诊断设置。
- 默认关闭的操作日志和网易云增强状态诊断。

## 网易云增强的边界

| 环境 | 取词 | 正常播放同步 | 拖动进度精准跟随 |
| --- | --- | --- | --- |
| 仅壁纸 | 支持 | 支持或估算 | 取决于网易云是否提供有效时间轴 |
| BetterNCM + InfLink-rs | 支持，且可用歌曲 ID 精确匹配 | 支持 | 支持 |

壁纸本身永远不会安装插件、注入 DLL 或控制播放器。增强安装器位于仓库外层，只在用户主动运行并确认风险后工作。

本项目附带的 InfLink-rs 以官方 `v3.2.11` 为基础，只修改 `manifest.json`：在原有 `vendors~app~subApp.chunk` 之外增加网易云 3.1.36 使用的 `app.chunk` 路径。原生 DLL 和 JavaScript 均未修改。对应二进制、完整源码、补丁、许可证与哈希位于 [`third_party/inflink-rs`](third_party/inflink-rs)。

## 卸载

双击：

```text
uninstall.cmd
```

默认只把壁纸移出使用目录并保留可恢复副本。BetterNCM 可能被其他插件使用，因此不会自动删除。若要停用 InfLink-rs，可按 [安装教程](docs/INSTALLATION.md#卸载与恢复) 执行。

## 手动导入

不使用安装器时，在 Wallpaper Engine 编辑器中导入：

```text
wallpaper/index.html
```

`wallpaper/` 是完整运行包，无构建步骤、无 Node.js 服务、无 Electron、无账号登录。

## 验证

本地核心验证：

```powershell
Get-ChildItem wallpaper\js -Filter *.js | ForEach-Object { node --check $_.FullName }
node tests\regression.test.js
node -e "JSON.parse(require('fs').readFileSync('wallpaper/project.json','utf8'))"
powershell -ExecutionPolicy Bypass -File tests\release-installer.test.ps1
powershell -ExecutionPolicy Bypass -File scripts\build-release.ps1 -VerifyOnly
```

涉及视觉或媒体回调时：

```powershell
powershell -ExecutionPolicy Bypass -File tests\wpe-visual-regression.ps1
```

GitHub Actions 会在 Windows 云端重跑核心逻辑、安装器沙盒测试、联网取词探针和 Release 解压/哈希验证。云端没有 Steam、Wallpaper Engine 和网易云客户端，因此真实 WebGL 桌面渲染与 SMTC 联调仍以本地 WPE 回归和真实桌面日志为准，不能用模拟结果冒充。

## 目录

```text
wallpaper/                 Wallpaper Engine 运行包
installer/                 安装、检测、备份和卸载脚本
third_party/inflink-rs/    插件二进制、完整对应源码、补丁和许可证
scripts/                   Release 打包与校验
tests/                     逻辑、安装器、联网和 WPE 回归
docs/                      架构、安装、增强、验证与交接文档
```

## 来源与许可

视觉代码与资源改编自 [XxHuberrr/Mineradio](https://github.com/XxHuberrr/Mineradio)，本项目及其改编部分按 GPL-3.0 发布。InfLink-rs 来源于 [apoint123/inflink-rs](https://github.com/apoint123/inflink-rs)，同样采用 GPL-3.0。BetterNCM 安装器运行时只从 [std-microblock/BetterNCM-Installer](https://github.com/std-microblock/BetterNCM-Installer) 的固定 Release 下载并校验，不在仓库中重新分发来源无法对应的本机 DLL。

第三方服务和完整署名见 [NOTICE.md](NOTICE.md) 与 [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md)，安全边界见 [SECURITY.md](SECURITY.md)。
