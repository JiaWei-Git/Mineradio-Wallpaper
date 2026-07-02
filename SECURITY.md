# 安全说明

## 信任边界

- `wallpaper/`：纯 Web Wallpaper，只读取 Wallpaper Engine 提供的频谱、媒体元数据、封面、播放状态和时间轴；不安装程序、不写网易云目录、不读取账号凭据。
- `installer/`：本地发布安装器，可以写入 Wallpaper Engine 项目目录；只有完整模式且用户明确确认后，才会启动 BetterNCM 官方安装器并写入 InfLink-rs 插件目录。
- `third_party/`：GPL 第三方二进制、完整对应源码、补丁、许可证和哈希。

## 未签名代码风险

BetterNCM Installer、BetterNCM 加载器和 InfLink-rs 原生插件可能没有 Windows Authenticode 签名。它们会改变网易云客户端加载链路，可能触发杀毒软件、与新版网易云不兼容或导致客户端启动失败。

安装器采用以下限制：

- 完整安装必须显式输入 `INSTALL`，非交互模式必须传入 `-AcceptUnsignedPluginRisk`。
- BetterNCM Installer 固定到官方 Release 1.2.0 并校验 SHA-256。
- 不分发本机 `msimg32.dll`，避免无法对应到公开源码的二进制进入 Release。
- InfLink-rs 覆盖前备份，复制后再次校验 SHA-256。
- 壁纸目录覆盖前整体移动为时间戳备份；复制或校验失败时恢复。

## 网络请求

运行壁纸可能访问网易云公开搜索/歌词接口和 LRCLIB；不上传网易云账号、密码、Cookie、操作日志或完整媒体历史。GitHub 安装器模式还会访问固定的 GitHub Release 下载地址。

## 报告问题

提交 GitHub Issue 时不要上传账号凭据、Cookie、私人文件路径或完整系统日志。歌词诊断日志默认不包含封面 Base64 和完整歌词正文；仍建议发布前人工检查。
