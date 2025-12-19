# AI 小说写作助手 (AI Novel Writing Assistant)

一个功能完备的AI驱动中文小说写作平台，集成智能续写、实时聊天、笔记管理和世界观构建于一体的专业写作工具。

## ✨ 核心功能

### 🚀 已完成的主要功能

- **🤖 AI智能续写**: 基于上下文的流式AI续写，支持自定义指导，包含重复文本检测和清理
- **💬 实时AI聊天**: 上下文感知的AI助手，可理解当前章节内容并提供针对性建议
- **📝 全屏写作编辑器**: 简洁高效的文本编辑器，专为中文写作优化
- **📌 智能笔记系统**: 位置精确的文本链接笔记，支持颜色分类和一键跳转
- **🎯 文本高亮**: 基于字符位置的高亮系统，选中文本即可创建笔记
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
- **Native Textarea** - 原生文本编辑器，轻量高效
- **Tailwind CSS** - 优雅的深色主题设计
- **Zustand** - 轻量级状态管理
- **TanStack Query** - 智能数据获取和缓存
- **Server-Sent Events** - 实时流式数据传输

## 项目结构

```
AI_writer/
├── backend/            # Django 后端
├── frontend/           # React 前端
├── README.md           # 用户指南（本文件）
├── CLAUDE.md           # 开发者指南
├── docker-compose.yml  # Docker 编排配置
└── start.sh            # 快速启动脚本
```

## 🚀 快速开始

### 方式一：Docker 部署（推荐）

这是最简单快速的启动方式，所有服务会在容器中自动配置和运行。

#### 环境要求
- Docker 20.10+
- Docker Compose 2.0+

#### 启动步骤

**方法一：使用快速启动脚本（最简单）**

```bash
git clone <repository-url>
cd AI_writer
./start.sh  # 自动配置并启动所有服务
```

脚本会自动：
- 创建 .env 文件（如果不存在）
- 启动所有 Docker 服务
- 显示访问地址和常用命令

**注意**: DeepSeek API密钥现在存储在用户设置中，每个用户需要在登录后在账户设置中配置自己的API密钥。

**方法二：手动启动**

1. **克隆项目并进入目录**
```bash
git clone <repository-url>
cd AI_writer
```

2. **配置环境变量（可选）**
```bash
cp .env.example .env
# 默认配置已经可以使用，如需自定义端口或其他设置请编辑 .env
```

3. **启动所有服务**
```bash
docker-compose up -d
```

等待构建完成后，服务将在以下端口运行：
- **前端**: http://localhost:3000
- **后端API**: http://localhost:8001
- **PostgreSQL**: localhost:5432
- **Redis**: localhost:6379

4. **查看日志**
```bash
docker-compose logs -f          # 所有服务日志
docker-compose logs -f backend   # 仅后端日志
docker-compose logs -f frontend  # 仅前端日志
```

5. **停止服务**
```bash
docker-compose down              # 停止服务
docker-compose down -v           # 停止服务并删除数据卷
```

#### 数据持久化

所有数据会保存在 Docker volumes 中：
- `postgres_data`: PostgreSQL 数据库数据
- `redis_data`: Redis 缓存数据
- `static_volume`: Django 静态文件
- `media_volume`: 用户上传的媒体文件

### 方式二：本地开发部署

适合需要调试和开发的场景。

#### 环境要求
- Python 3.11+
- Node.js 18+
- PostgreSQL 16 (可选，开发环境使用SQLite)
- Redis (WebSocket功能需要)

#### 后端设置
```bash
cd backend
pip install -r requirements.txt

# 配置环境变量（可选）
cp .env.example .env
# 默认配置已经可以使用

# 数据库迁移
python manage.py migrate

# 启动后端服务
python manage.py runserver 0.0.0.0:8001
```

#### 前端设置
```bash
cd frontend
npm install

# 配置环境变量
cp .env.example .env
# 编辑 .env 文件，设置API_URL

# 启动前端开发服务器
npm run dev
```

### 首次使用

无论使用哪种方式启动，首次使用需要：

1. 访问 http://localhost:3000
2. 注册新账号
3. 在账户设置中配置您的 DeepSeek API 密钥
4. 开始创作！


## 📋 功能演示

### 主要界面
- **三面板布局**: 编辑器 + 笔记 + AI聊天
- **实时写作**: 全屏编辑器提供专注写作体验
- **智能提示**: 基于上下文的AI建议和续写
- **笔记管理**: 基于字符位置精确绑定的笔记系统

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
- [x] 全屏文本编辑器
- [x] AI流式续写
- [x] 实时AI聊天
- [x] 智能笔记系统（位置跟踪）
- [x] 文本高亮和跳转
- [x] 自动保存（5秒间隔）
- [x] 世界观管理
- [x] 重复文本检测
- [x] 响应式UI设计
- [x] WebSocket实时通信

## 📦 常用命令

### Docker 管理

```bash
# 启动服务
docker-compose up -d

# 停止服务
docker-compose down

# 查看服务状态
docker-compose ps

# 查看日志
docker-compose logs -f                # 所有服务
docker-compose logs -f backend        # 仅后端
docker-compose logs -f frontend       # 仅前端

# 重启服务
docker-compose restart backend
docker-compose restart frontend

# 重新构建（代码更改后）
docker-compose up -d --build

# 完全清理（删除所有数据）
docker-compose down -v
```

### Django 管理

```bash
# 进入后端容器
docker-compose exec backend bash

# 数据库迁移
docker-compose exec backend python manage.py migrate

# 创建超级用户
docker-compose exec backend python manage.py createsuperuser

# Django Shell
docker-compose exec backend python manage.py shell

# 收集静态文件
docker-compose exec backend python manage.py collectstatic --noinput
```

### 数据库操作

```bash
# 连接到 PostgreSQL
docker-compose exec postgres psql -U novel_user -d novel_ai_db

# 备份数据库
docker-compose exec postgres pg_dump -U novel_user novel_ai_db > backup.sql

# 恢复数据库
cat backup.sql | docker-compose exec -T postgres psql -U novel_user -d novel_ai_db

# 查看所有表
docker-compose exec postgres psql -U novel_user -d novel_ai_db -c "\dt"
```

### 监控和调试

```bash
# 查看资源使用
docker-compose stats

# 实时查看日志
docker-compose logs -f --tail=100

# 检查 Redis 连接
docker-compose exec redis redis-cli ping

# 检查 PostgreSQL 连接
docker-compose exec postgres pg_isready -U novel_user
```

### 常见问题排查

**服务无法启动？**
```bash
docker-compose logs backend
docker-compose logs postgres
docker-compose restart backend
```

**前端无法访问后端？**
```bash
# 检查 .env 配置
cat .env | grep VITE_API_URL

# 重新构建前端
docker-compose up -d --build frontend
```

**数据库连接失败？**
```bash
# 等待 PostgreSQL 启动完成
docker-compose exec postgres pg_isready -U novel_user
sleep 5
docker-compose restart backend
```

**完全重置（慎用）？**
```bash
docker-compose down -v
docker system prune -a
docker-compose up -d --build
```

## 🔧 环境变量配置

创建 `.env` 文件来自定义配置：

```bash
# 数据库配置
DB_NAME=novel_ai_db
DB_USER=novel_user
DB_PASSWORD=novel_password
POSTGRES_PORT=5432

# Redis 配置
REDIS_PORT=6379

# 后端配置
BACKEND_PORT=8001
DEBUG=True
SECRET_KEY=your-secret-key-change-in-production
ALLOWED_HOSTS=localhost,127.0.0.1

# DeepSeek API（注意：API密钥在用户设置中配置，不在这里）
DEEPSEEK_API_BASE=https://api.deepseek.com/v1

# 前端配置
FRONTEND_PORT=3000
FRONTEND_URL=http://localhost:3000
VITE_API_URL=http://localhost:8001/api
```

## 🔐 API 密钥说明

**重要**: DeepSeek API 密钥现在是 **每用户独立配置**，而不是全局配置。

- ✅ 每个用户在账户设置中配置自己的 API 密钥
- ✅ API 密钥加密存储在数据库中
- ✅ 支持多用户使用各自的 API 配额
- ❌ 不再需要在 `.env` 文件中配置 `DEEPSEEK_API_KEY`

### 配置步骤：
1. 注册并登录应用
2. 进入 "账户设置" 或 "用户设置"
3. 在 API 密钥配置区域输入您的 DeepSeek API 密钥
4. 保存后即可使用所有 AI 功能

## 📝 生产部署注意事项

部署到生产环境时：

1. **安全配置**
   - 设置强密码: `DB_PASSWORD`, `SECRET_KEY`
   - 关闭调试模式: `DEBUG=False`
   - 配置允许的域名: `ALLOWED_HOSTS=yourdomain.com`

2. **HTTPS 配置**
   - 使用 SSL 证书
   - 更新 `nginx.conf` 配置 SSL
   - 设置 `FRONTEND_URL=https://yourdomain.com`

3. **数据备份**
   - 定期备份 PostgreSQL 数据库
   - 定期备份 Docker volumes
   - 使用 `docker-compose exec postgres pg_dump` 进行备份

4. **监控和日志**
   - 设置日志轮转
   - 监控 Docker 容器资源使用
   - 配置错误告警

## 许可证

MIT License