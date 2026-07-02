# Mineradio 5.1 工程规则

## 目标

把 Mineradio 视觉系统迁移为可直接导入 Wallpaper Engine 的 Web Wallpaper。视觉迁移以上游实现为基准，Wallpaper Engine 与 Electron 的差异通过适配层解决。

## 新会话先读

1. `README.md`
2. `docs/HANDOFF.md`
3. `docs/ARCHITECTURE.md`
4. 涉及原版视觉函数时再读 `docs/UPSTREAM_MAP.md`

## 当前范围

- 8 个视觉预设、3D 歌单架、舞台歌词、中文设置和自由镜头。
- 歌词由网易云公开接口优先、LRCLIB 备用；壁纸运行时不使用本地服务，默认不依赖播放器插件。
- 媒体位置优先接受 Wallpaper Engine 原生回调。网易云原生会话不提供有效时间轴时，允许读取用户已批准安装的 InfLink-rs 增强会话：`genres=NCM-{ID}` 只用于精确取词，时间轴仍必须来自 Wallpaper Engine 媒体回调。
- 不在 `wallpaper/` 内安装、更新或注入 DLL；仓库外层发布安装器可提供可选增强，但必须固定来源和哈希、先备份、明确披露未签名 DLL 注入风险并取得用户确认。InfLink-rs 启用时必须关闭网易云原生“开启 SMTC”，避免 `0/0` 会话覆盖增强时间轴。
- 第三方修改包必须放在 `third_party/`，同时保留对应 GPL 源码、补丁、许可证、上游版本和哈希；不得把来源不明的本机 DLL 当成官方包发布。
- 不迁移账号、播放器、搜索界面、桌面窗口和 Electron 专属功能。

## 模块边界

- `we-adapter.js`：Wallpaper Engine 回调标准化。
- `audio-reactor.js`：频谱、节拍和能量状态。
- `media-history.js`：当前媒体、原生时间轴和历史记录。
- `lyrics-engine.js`：歌词匹配、缓存、解析和播放位置映射。
- `lyrics-visual.js`：歌词字形与 Three.js 光效。
- `operation-log.js`：可选诊断日志。
- `visual-core.js`：场景、预设、镜头和歌单架。
- `properties.js`：`project.json` 属性映射。
- `main.js`：模块连接，不放视觉算法。

## 同步原则

- `position/duration` 是权威输入，任何不连续都必须立即重新定位歌词。
- “歌词请求成功”和“拖动同步成功”是两条独立链路；前者只需曲目信息，后者必须收到拖动后的权威 `position`。
- 官方时间轴可能不规则触发，不能因为几秒未更新就擅自判定失效。
- 没有时间轴时，只能明确进入估算、静态或隐藏降级，不能伪造 seek 目标。
- 同一个错误连续出现两次后，先搜索 3-5 种已知解法，再选择成本最低且可验证的一种实施。

## 验证

每次修改后至少运行：

```powershell
Get-ChildItem wallpaper/js -Filter *.js | ForEach-Object { node --check $_.FullName }
node tests/regression.test.js
node -e "JSON.parse(require('fs').readFileSync('wallpaper/project.json','utf8'))"
```

涉及公开安装或发布包时，追加运行：

```powershell
powershell -ExecutionPolicy Bypass -File tests/release-installer.test.ps1
powershell -ExecutionPolicy Bypass -File scripts/build-release.ps1 -VerifyOnly
```

涉及视觉、媒体回调或属性时，还需在 Wallpaper Engine 中检查 8 个预设、拖动镜头、切歌、暂停/恢复、前后跳听和不同画质档位。
