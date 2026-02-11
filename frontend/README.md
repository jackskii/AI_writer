# Frontend README

React + TypeScript + Vite 前端，负责编辑器 UI、作品管理页面、AI 交互面板、移动端适配等。

> 生产运行方式以根目录脚本为准（`start.sh` / `restart-frontend.sh`）。

## 技术栈

- React
- TypeScript
- Vite
- Tailwind CSS
- Zustand
- TanStack Query
- Axios

## 目录结构（核心）

```text
frontend/src/
├── components/
│   ├── editor/      # 编辑器与聊天面板
│   ├── chapters/    # 卷/章节列表组件
│   ├── lore/        # 世界观与阵营组件
│   ├── modals/      # 各种弹窗（自动编辑、摘要、设置等）
│   └── ui/          # 基础 UI 组件
├── pages/           # 页面入口（Home/WorkDetail/Editor/Auth）
├── services/        # API 封装
├── stores/          # Zustand 全局状态
└── types/           # 类型定义
```

## 本地开发（前端单独）

```bash
cd frontend
npm install
npm run dev
```

默认开发地址：

- `http://localhost:5173`

## 生产容器中的前端更新方式

当前前端在生产模式下是静态构建镜像，不是热更新容器。
改动前端代码后，请使用根目录脚本：

```bash
cd ..
bash restart-frontend.sh
```

不要只执行 `docker restart novel_ai_frontend`，那不会重新打包新代码。

## 常用命令

```bash
# 开发
npm run dev

# 构建
npm run build

# 预览
npm run preview

# Lint
npm run lint
```

## 环境变量

前端最关键变量：

```bash
VITE_API_URL=/api
```

在当前部署方式中，构建时由根目录脚本传入 `--build-arg VITE_API_URL=...`。

## 关键页面

- `pages/HomePage.tsx`：作品列表主页
- `pages/WorkDetailPage.tsx`：作品详情（卷/章节/世界观）
- `pages/EditorPage.tsx`：正文编辑页（自动保存、AI 操作）
- `pages/AuthPage.tsx`：登录注册页

## 调试建议

- 接口问题先看浏览器 Network，再看后端日志。
- 前端构建错误优先检查：
  - TS 报错
  - 未使用变量（`TS6133`）
  - API 类型与后端返回不一致
- 复杂交互（自动编辑、拖拽）先在桌面浏览器复现，再测移动端。

## 相关文档

- 根文档：`../README.md`
- 编辑器系统：`docs/EDITOR_SYSTEM.md`
- 流式接口：`docs/STREAMING.md`
