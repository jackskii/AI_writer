# AI 小说写作助手 (AI Novel Writing Assistant)

一个功能完备的AI驱动中文小说写作平台，集成智能续写、实时聊天、笔记管理和世界观构建于一体的专业写作工具。

## ✨ 核心功能

### 🚀 已完成的主要功能

- **🤖 AI智能续写**: 基于上下文的流式AI续写，支持自定义指导，包含重复文本检测和清理
- **💬 实时AI聊天**: 上下文感知的AI助手，可理解当前章节内容并提供针对性建议
- **📝 Monaco编辑器**: 专业代码编辑器适配中文写作，支持语法高亮和智能提示
- **📌 智能笔记系统**: 位置精确的文本链接笔记，支持颜色分类和一键跳转
- **🎯 文本高亮**: 基于Monaco装饰器的稳定高亮系统，支持点击切换
- **⚡ 实时流式响应**: 所有AI交互均采用SSE流式传输，提供实时体验
- **💾 智能自动保存**: 5秒间隔自动保存，支持冲突检测和状态指示
- **🌍 世界观管理**: 触发词系统自动加载相关设定到AI上下文
- **📊 章节管理**: 支持多卷结构，AI自动生成章节摘要
- **🔒 完整用户系统**: 注册登录、令牌认证、多用户支持

## 🛠 技术栈

### 后端架构
- **Django 5.0** + Django REST Framework - 主要API框架
- **PostgreSQL 16** - 生产数据库
- **Django Channels** - WebSocket实时通信
- **Redis** - 缓存和消息队列
- **DeepSeek API** - AI模型集成
- **Token认证** - 支持流式传输的认证系统

### 前端架构
- **React 18** + TypeScript - 现代化前端框架
- **Monaco Editor** - 专业文本编辑器
- **Tailwind CSS** - 优雅的深色主题设计
- **Zustand** - 轻量级状态管理
- **TanStack Query** - 智能数据获取和缓存
- **Server-Sent Events** - 实时流式数据传输

## 项目结构

```
AI_writer/
├── backend/            # Django 后端
├── frontend/           # React 前端
├── docs/              # 项目文档
└── README.md          # 项目说明
```

## 🚀 快速开始

### 环境要求
- Python 3.11+
- Node.js 18+
- PostgreSQL 16 (可选，开发环境使用SQLite)
- Redis (WebSocket功能需要)
- DeepSeek API密钥

### 后端设置
```bash
cd backend
pip install -r requirements.txt

# 配置环境变量
cp .env.example .env
# 编辑 .env 文件，添加您的 DEEPSEEK_API_KEY

# 数据库迁移
python manage.py migrate

# 启动后端服务
python manage.py runserver 0.0.0.0:8001
```

### 前端设置
```bash
cd frontend
npm install

# 配置环境变量
cp .env.example .env
# 编辑 .env 文件，设置API_URL

# 启动前端开发服务器
npm run dev
```


## 📋 功能演示

### 主要界面
- **三面板布局**: 编辑器 + 笔记 + AI聊天
- **实时写作**: Monaco编辑器支持专业写作体验
- **智能提示**: 基于上下文的AI建议和续写
- **笔记管理**: 与文本位置精确绑定的笔记系统

### AI功能
- **流式续写**: 实时显示AI生成内容
- **上下文聊天**: AI理解当前章节内容
- **智能建议**: 选中文本获取写作建议
- **自动摘要**: 章节完成后自动生成摘要

## 📊 项目状态

✅ **v1.0 已完成** - 所有核心功能已实现并稳定运行

### 已实现功能清单
- [x] 用户认证系统
- [x] 作品和章节管理
- [x] Monaco编辑器集成
- [x] AI流式续写
- [x] 实时AI聊天
- [x] 智能笔记系统
- [x] 文本高亮和跳转
- [x] 自动保存
- [x] 世界观管理
- [x] 重复文本检测
- [x] 响应式UI设计
- [x] WebSocket实时通信

## 许可证

MIT License