# KairoWeb Engine — 开罗游戏通用运行平台

> 基于 **Vite + TypeScript + React + KairoEngine (KairoVM 数据驱动虚拟机 + KairoHAL 硬件抽象层)** 构建的开罗像素游戏 Web 运行平台。

## 添加游戏

支持任意 Unity IL2CPP 架构的开罗游戏安装包（Android `.apk`、PC Steam `.zip` 或 `*_Data` 目录）：
- 自动扫描 `resources.assets` / `data.unity3d` 二进制流中的加密归档；
- 自动读取 `encrypt_key` 或通过归档头部方程（`4 + header_size + total_size == len(blob)` + ASCII 文件名校验）**全自动逆向推导 4 字节 XOR 密钥**；
- 自动合并 `xls/Japanese.lproj/*.txt` 数值表、`language_pack_template_ja` 坐标映射与 `*_sc.csv` 官方简体中文语言包，输出 `game.bin` 与 `manifest.json`。

```bash
# 提取 Android APK 或 PC ZIP 到指定卡带目录
python3 tools/apk2cartridge.py <输入文件.apk或.zip> --id <game_id> -o public/cartridges/<game_id>/game.bin
```

## 开发与构建

```bash
pnpm install
pnpm dev
pnpm build
```
