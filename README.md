# AI 小说写作助手

AI 驱动的中文小说创作平台，支持长篇写作、多卷管理、世界观条目、章节/卷摘要、AI 自动编辑、写作建议与跨设备使用。

本项目当前以 `start.sh`（纯 Docker 命令）作为主要运行方式，不依赖 Docker Compose。

## 当前核心功能

- 章节编辑器（桌面/移动端适配）
- 自动保存 + 手动保存
- AI 自动编辑（流式），支持自定义编辑指引
- 编辑指引预设（用户级配置，可新增/编辑，`增加细节`不可删除）
- 章节摘要（AI 生成 + 手动编辑）
- 卷摘要（AI 生成 + 编辑）
- 多卷结构（含外传卷），章节可拖拽排序
- 世界观条目与阵营管理（自动上下文注入）
- 用户系统（注册、登录、个人设置、API key 加密存储）
- 写作风格（创建、分析、应用）

## 技术栈

### Backend

- Python 3.11
- Django + Django REST Framework
- PostgreSQL
- Redis（缓存；可选）
- Daphne (ASGI / SSE)
- DeepSeek / Qwen / OpenRouter（通过用户设置选择）

### Frontend

- React + TypeScript + Vite
- Zustand
- TanStack Query
- Tailwind CSS
- SSE 流式接口

## 项目结构

```text
AI_writer/
├── backend/
├── frontend/
├── start.sh                 # 一键启动（创建/重建容器）
├── stop.sh                  # 停止容器
├── restart-frontend.sh      # 仅重建并重启前端
├── restart-backend.sh       # 仅重启后端（可 --rebuild）
└── README.md
```

## 快速启动（推荐）

```bash
cd AI_writer
bash start.sh
```

默认访问地址：

- 前端: `http://0.0.0.0:3000`
- 后端: `http://0.0.0.0:8001`

## 日常开发命令（当前流程）

### 停止所有服务

```bash
bash stop.sh
```

### 仅更新前端（最常用）

```bash
bash restart-frontend.sh
```

### 仅重启后端

```bash
bash restart-backend.sh
```

### 后端依赖或镜像层有变化时

```bash
bash restart-backend.sh --rebuild
```

## 运行模型说明

- `start.sh` 会创建网络与 volume，并重新创建 `postgres / redis / backend / frontend` 容器。
- 后端容器挂载了本地 `backend` 目录，启动时会自动执行迁移：
  - `python manage.py migrate --noinput`
- 前端是构建后静态镜像；前端代码更新需要重建前端镜像（`restart-frontend.sh`）。

## BuildKit 说明

脚本中已加入自动检测：

- 有 `docker buildx`：启用 BuildKit
- 无 `docker buildx`：自动回退到 classic build（不会中断脚本）

安装 buildx（在宿主机，不是应用容器）：

```bash
sudo apt-get update
sudo apt-get install -y docker-buildx-plugin
docker buildx version
```

## 环境变量

可在项目根目录创建 `.env`（`start.sh` 会读取），常用项：

```bash
DB_NAME=novel_ai_db
DB_USER=novel_user
DB_PASSWORD=novel_password

BACKEND_PORT=8001
FRONTEND_PORT=3000

DEBUG=True
SECRET_KEY=change-me
ALLOWED_HOSTS=*

DEEPSEEK_API_BASE=https://api.deepseek.com/v1
FRONTEND_URL=http://0.0.0.0:3000
VITE_API_URL=/api
```

## API Key 机制

- API key 为用户级配置（不是全局配置）
- 在前端设置页中填写并保存
- 后端加密存储

## 数据安全与备份（强烈建议）

在任何重构/上线前先备份 PostgreSQL：

```bash
cd AI_writer
source .env
docker exec -t novel_ai_postgres pg_dump -U "$DB_USER" -d "$DB_NAME" > backup_$(date +%F_%H%M%S).sql
```

恢复：

```bash
source .env
cat backup_xxx.sql | docker exec -i novel_ai_postgres psql -U "$DB_USER" -d "$DB_NAME"
```

## 故障排查

### 前端改了但页面没变化

- 前端容器是静态镜像，`docker restart novel_ai_frontend` 不会重新构建。
- 请使用：

```bash
bash restart-frontend.sh
```

### 后端接口报数据库表不存在

- 通常是迁移未执行或未生效，先重启后端：

```bash
bash restart-backend.sh
```

- 如果仍失败，进入后端容器手动迁移：

```bash
docker exec -it novel_ai_backend bash
python manage.py migrate
```

### 查看日志

```bash
docker logs -f novel_ai_backend
docker logs -f novel_ai_frontend
docker logs -f novel_ai_postgres
docker logs -f novel_ai_redis
```

## 其他文档

- 后端说明：`backend/README.md`
- 前端说明：`frontend/README.md`
- AI 提示词说明：`backend/apps/ai_services/PROMPTS_README.md`

## License

MIT