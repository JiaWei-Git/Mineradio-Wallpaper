# 安装教程

## 系统要求

- Windows 10/11。
- Steam 版 Wallpaper Engine。
- 仅使用壁纸时不要求安装网易云插件。
- 完整增强模式要求网易云音乐 Win32 客户端；本项目真实验证版本为 `3.1.36.205322`。

## 推荐安装

1. 从 GitHub Releases 下载 `Mineradio-Wallpaper-v1.0.0.zip`。
2. 完整解压。不要直接在压缩包预览窗口中运行脚本。
3. 双击 `install.cmd`。
4. 选择：
   - `1`：完整安装；
   - `2`：仅安装壁纸；
   - `3`：退出。
5. 完整安装会显示未签名 DLL 风险。只有输入大写 `INSTALL` 后才继续。
6. 如果 BetterNCM 尚未安装，脚本会下载固定的官方安装器 `1.2.0`，核对 SHA-256 后打开其安装窗口。
7. 完成后播放网易云歌曲，在壁纸设置的“高级性能”中开启诊断面板。完整增强应显示 `netease-enhanced`。

安装器会扫描 Steam 注册表和 `libraryfolders.vdf`，支持非 C 盘 Steam 库。壁纸安装位置为：

```text
<Wallpaper Engine>\projects\myprojects\mineradio-wallpaper
```

重复安装不会直接覆盖旧目录：旧壁纸和旧 InfLink-rs 都会先加时间戳备份。

## 完整模式实际执行内容

1. 安装并逐文件 SHA-256 校验 `wallpaper/`。
2. 从固定地址下载 BetterNCM Installer 1.2.0：

   ```text
   https://github.com/std-microblock/BetterNCM-Installer/releases/download/1.2.0/betterncm_installer.exe
   SHA-256: F4AABE8FBC09BB78AD66AAA28DBD26F2FB01D782CBA0611152CF8F5CC6CB1468
   ```

3. 检查网易云目录中的 `msimg32.dll`，但不会把本机 DLL打包进仓库。
4. 备份并安装：

   ```text
   C:\betterncm\plugins\InfLink-rs.plugin
   SHA-256: 9154B5BB666FD1E72A0F788F4405A1A00C6DE418BFE7B74C30B5036CC26E9F57
   ```

5. 重启网易云音乐和加载壁纸。

InfLink-rs 包包含未签名的 `backend.dll` 和 `backend.dll.x64.dll`。本项目验证过：与官方 3.2.11 原包相比，两个 DLL、`index.js` 和 `preview.png` 的 SHA-256 完全一致，只有 `manifest.json` 发生变化。

## PowerShell 参数

高级用户可直接运行：

```powershell
powershell -ExecutionPolicy Bypass -File installer\install.ps1 -Mode WallpaperOnly
```

完整非交互模式必须显式接受风险：

```powershell
powershell -ExecutionPolicy Bypass -File installer\install.ps1 `
  -Mode Full `
  -AcceptUnsignedPluginRisk `
  -NonInteractive
```

可选路径参数：

```text
-WallpaperEnginePath
-NeteasePath
-BetterNcmDataPath
-BetterNcmInstallerPath
```

## 手动导入

1. 打开 Wallpaper Engine。
2. 进入壁纸编辑器。
3. 选择创建 Web Wallpaper。
4. 导入 `wallpaper/index.html`。
5. 保存并应用。

## 常见问题

### 歌词能显示，但拖动后不跳转

打开诊断面板：

- `netease-enhanced`：增强链路正常；复制日志检查 `media.seek`。
- `netease-zero-zero`：网易云原生坏 SMTC 会话仍在覆盖增强会话；关闭网易云原生“开启 SMTC”并重启。
- `netease-id-only`：有歌曲 ID，但暂未收到有效时间轴；检查 InfLink-rs。
- `metadata-only`：只有曲目信息，壁纸无法得知拖动后的目标秒数。

### 安装器报 SHA-256 不匹配

立即停止，不要绕过校验。删除下载文件，确认网络代理、杀毒软件和 GitHub 下载未篡改后重试。

### 网易云更新后打不开

1. 关闭网易云。
2. 将网易云安装目录中的 `msimg32.dll` 移出该目录，暂时停用 BetterNCM。
3. 使用安装器生成的 `.backup-*` 文件恢复旧 InfLink-rs。
4. 等待 BetterNCM/InfLink-rs 上游适配新版客户端。

## 卸载与恢复

双击 `uninstall.cmd` 会把壁纸目录移动为：

```text
mineradio-wallpaper.removed-YYYYMMDD-HHMMSS
```

不会直接删除，改回原目录名即可恢复。

停用 InfLink-rs：

```powershell
powershell -ExecutionPolicy Bypass -File installer\uninstall.ps1 -RemoveInfLink
```

该操作同样只移动插件并保留时间戳副本。BetterNCM 不会自动卸载，因为它可能仍被其他插件使用。
