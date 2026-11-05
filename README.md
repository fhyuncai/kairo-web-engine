# KairoWeb Engine — 开罗游戏通用运行平台

> 基于 **Vite + TypeScript + React + KairoEngine (.NET CIL 栈式虚拟机 + DoJa 硬件抽象层)** 构建的通用开罗经典像素游戏 Web 运行平台。

## 添加游戏

平台支持两种添加游戏的方式：**项目目录配置** 与 **网页即插即用**。

### 方式一：在项目中配置游戏

#### 1. 准备游戏文件与目录
在 `public/cartridges/` 下为你的游戏创建一个独立的目录（目录名即为游戏 `ID`），并将游戏的 `manifest.json` 与 `game.bin` 放入其中：

```text
public/cartridges/
├── manifest.json                    # 游戏清单
└── <game_id>/                       # 游戏目录
    ├── manifest.json                # 游戏基本信息
    └── game.bin                     # 游戏二进制文件
```

#### 2. 在根清单中声明游戏 ID
编辑 [`public/cartridges/manifest.json`](public/cartridges/manifest.json)，在 `cartridges` 列表中添加该游戏 ID：

```json
{
  "cartridges": [
    "game_dev_story",
    "hot_springs_story",
    "dungeon_village"
  ]
}
```

#### 3. 编写游戏子目录清单 `manifest.json`
在 `public/cartridges/<game_id>/manifest.json` 中配置游戏的基本呈现信息：

```json
{
  "title": "温泉物语",
  "category": "模拟经营",
  "resolution": [240, 284],
  "description": "打造非凡的人气温泉旅馆，自由配置客房、小卖部和温泉，打造让客人宾至如归的知名温泉胜地。"
}
```

### 方式二：网页即插即用

1. 启动项目；
2. 点击顶栏右侧的 **「加载本地游戏」** 按钮；
3. 选择本地的 `.bin` 游戏文件。

---

## 游戏转换工具

如果你拥有开罗游戏的 Android APK，可通过内置离线工具将其解包并转换为通用的游戏 `.bin` 文件：

```bash
python3 tools/apk2cartridge.py <your_game.apk> --id <game_id> --title <游戏名称> -o public/cartridges/<game_id>/game.bin
```

---

## 开发与构建

```bash
# 安装依赖
pnpm install

# 启动本地服务
pnpm dev

# 编译打包
pnpm build

# 预览构建结果
pnpm preview
```
