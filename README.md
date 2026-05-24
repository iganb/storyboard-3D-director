<div align="center">
  <h1>Storyboard 3D Director</h1>
  <h3>基于节点画布的 AI 分镜工作台 + 3D 导演台，一站式完成图片生成、编辑、3D 场景编排与分镜流程</h3>
</div>

## 技术栈

- 前端：React 18 + TypeScript + Zustand + `@xyflow/react` + TailwindCSS + Three.js
- 桌面容器：Tauri 2
- 后端：Rust 命令接口
- 数据存储：SQLite（`rusqlite`，WAL）
- i18n：`react-i18next` + `i18next`

## 环境要求

- Node.js 20+
- npm 10+
- Rust stable（含 Cargo）
- Tauri 平台依赖（Windows/macOS）

## 快速开始

```bash
npm install
```

仅前端开发：

```bash
npm run dev
```

Tauri 联调（推荐）：

```bash
npm run tauri dev
```

## 常用命令

```bash
# TypeScript 类型检查
npx tsc --noEmit

# Rust 快速检查
cd src-tauri && cargo check

# 前端构建检查
npm run build

# Tauri 构建桌面应用
npm run tauri build
```

## 项目结构（核心）

```text
src/
  features/canvas/          # 画布主流程（节点、工具、模型、UI）
  features/director3d/      # 3D 导演台（角色编排、相机机位、截图）
  stores/                   # 全局状态与自动持久化策略
  commands/                 # 前端到 Tauri 命令桥接
  i18n/                     # 国际化入口与语言包
src-tauri/src/
  commands/                 # Rust 侧命令实现（含 project_state）
  lib.rs                    # Tauri 命令注册入口
docs/development-guides/    # 开发与扩展文档
```

## 核心功能

### 2D 分镜画布
- 节点化图片上传、AI 生成/编辑、工具处理（裁剪/标注/分镜）
- 节点连线与流程编排
- 多模型供应商支持

### 3D 导演台
- 3D 场景编辑器，支持角色放置与变换（移动/旋转/缩放）
- TransformControls gizmo 交互
- 相机机位系统（预设视角、自定义机位保存/切换）
- 角色调色板与属性面板
- 截图到画布（支持 16:9 / 9:16 比例）

## 架构要点

- 分层数据流：`UI -> Store -> Application Service -> Command/API -> Persistence`
- 节点注册单一真相源：`src/features/canvas/domain/nodeRegistry.ts`
- 工具体系分层：`tools/types.ts`、`tools/builtInTools.ts`、`ui/tool-editors/*`、`application/toolProcessor.ts`
- 持久化双通道：
  - 项目快照：`upsert_project_record`
  - 视口快照：`update_project_viewport_record`

## 扩展开发

### 新增模型

1. 在 `src/features/canvas/models/image/<provider>/` 新增模型文件
2. 声明 `displayName`、`providerId`、分辨率/比例、默认参数
3. 实现请求映射函数 `resolveRequest`

### 新增工具

1. 在 `src/features/canvas/tools/types.ts` 声明能力
2. 在 `src/features/canvas/tools/builtInTools.ts` 注册
3. 在 `src/features/canvas/ui/tool-editors/` 新增编辑器
4. 在 `src/features/canvas/application/toolProcessor.ts` 接入执行

### 新增节点

1. 在 `src/features/canvas/domain/canvasNodes.ts` 增加类型与数据结构
2. 在 `src/features/canvas/domain/nodeRegistry.ts` 注册默认数据与连线能力
3. 在 `src/features/canvas/nodes/index.ts` 注册渲染组件

详细指南：
- [项目开发环境与注意事项](./docs/development-guides/project-development-setup.md)
- [供应商与模型扩展指南](./docs/development-guides/provider-and-model-extension.md)

## 持久化与数据说明

- 自动持久化由 `projectStore` 驱动，不需要手动保存
- SQLite 文件位于 Tauri `app_data_dir/projects.db`
- `projects` 表核心字段：`nodes_json`、`edges_json`、`viewport_json`、`history_json`、`node_count`
- 图片字段通过 `imagePool + __img_ref__` 去重编码

## i18n 约定

- 入口：`src/i18n/index.ts`
- 语言包：`src/i18n/locales/zh.json`、`src/i18n/locales/en.json`
- 代码中使用 `useTranslation()` + `t('key.path')`，避免硬编码文案
