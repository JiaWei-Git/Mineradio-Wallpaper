# InfLink-rs 来源与修改

## 上游

- Repository: https://github.com/apoint123/inflink-rs
- Release: `v3.2.11`
- Release commit: `0dfa9f5cb2eddddeb76435642e5527352f593bb7`
- `libs/libcef` submodule commit: `615be4a613a63225aade97ba287cb3f343bff797`
- License: GPL-3.0

## 本项目修改

本项目验证环境为网易云音乐 `3.1.36.205322`。该客户端使用：

```text
orpheus://orpheus/pub/hybrid/app.chunk
```

上游 v3.2.11 的 manifest 只匹配：

```text
orpheus://orpheus/pub/hybrid/vendors~app~subApp.chunk
```

因此只修改 `packages/frontend/manifest.json`，让旧、新路径都禁用网易云原生坏 SMTC 会话。补丁见 `patches/v3.2.11-ncm-3.1.36.patch`。

## 可核验产物

| 文件 | SHA-256 |
| --- | --- |
| 官方原始 `InfLink-rs.plugin` | `F437B6ECDA3915C147E5E195F4F5DAE4C4A7534A8F8B46EAE8636C401BF956F3` |
| 本项目修订 `InfLink-rs-v3.2.11-ncm-3.1.36.plugin` | `9154B5BB666FD1E72A0F788F4405A1A00C6DE418BFE7B74C30B5036CC26E9F57` |
| 完整对应源码 `InfLink-rs-v3.2.11-ncm-3.1.36-source.zip` | `EA8F471E074548801797C61D4A82E416CA5A0671FB491A6F523937C39821F699` |

对两个插件包逐项解压比较：`backend.dll`、`backend.dll.x64.dll`、`index.js`、`preview.png` 完全相同，只有 `manifest.json` 不同。

`InfLink-rs-v3.2.11-ncm-3.1.36-source.zip` 是包含子模块内容的完整对应源码快照，已应用相同 manifest 补丁，可按上游 README 使用 Bun、Node.js 和 Rust 构建。
