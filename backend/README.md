# Backend README

Django 后端服务，提供作品管理、章节编辑、世界观与阵营、AI 服务、用户设置与认证等 API。

> 运行方式以项目根目录脚本为准：`start.sh` / `restart-backend.sh`。

## 技术栈

- Python 3.11
- Django + Django REST Framework
- PostgreSQL
- Redis
- Channels / Daphne
- Token + Session 认证

## 主要应用模块

- `apps/works`：作品、卷（Act）、章节、阵营、世界观条目、写作风格
- `apps/ai_services`：AI 相关接口（自动编辑、摘要、条目生成等）
- `apps/chat`：聊天与会话相关
- `apps/notes`：笔记相关
- `apps/user_auth`：注册登录、用户设置、API key、编辑指引预设
- `apps/core`：中间件与公共逻辑

## 启动与重启（推荐从项目根目录执行）

```bash
# 一键启动全栈（会启动/重建所有容器）
bash start.sh

# 仅重启后端（代码改动常用）
bash restart-backend.sh

# 后端依赖有变化时
bash restart-backend.sh --rebuild
```

后端容器启动时会自动执行：

```bash
python manage.py migrate --noinput
python manage.py collectstatic --noinput --clear
```

## 本地调试（仅后端）

```bash
cd backend
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver 0.0.0.0:8001
```

> 注意：当前 `settings.py` 默认数据库引擎为 PostgreSQL，需配好对应环境变量。

## 关键 API 路由（简要）

- 认证：
  - `POST /api/auth/register/`
  - `POST /api/auth/login/`
  - `GET /api/auth/settings/`
  - `PUT /api/auth/settings/update/`
- 作品：
  - `GET /api/works/`
  - `GET /api/works/{id}/`
- 章节：
  - `GET /api/works/{work_id}/chapters/`
  - `PATCH /api/works/{work_id}/chapters/{id}/autosave/`
  - `POST /api/works/{work_id}/chapters/reorder/`
- AI：
  - `POST /api/ai/suggest/`
  - `POST /api/ai/auto-edit/stream/`
  - `POST /api/ai/summary/stream/`
  - 其他接口见 `apps/ai_services/urls.py`

## 环境变量（常用）

```bash
DEBUG=True
SECRET_KEY=change-me
ALLOWED_HOSTS=*

DB_NAME=novel_ai_db
DB_USER=novel_user
DB_PASSWORD=novel_password
DB_HOST=postgres
DB_PORT=5432

REDIS_URL=redis://redis:6379/0
FRONTEND_URL=http://0.0.0.0:3000
DEEPSEEK_API_BASE=https://api.deepseek.com/v1
```

## 开发注意事项

- 修改 `models.py` 后必须提交 migration 文件。
- 不要依赖“本地临时 makemigrations 未提交”；容器重启后以仓库 migration 为准。
- 与前端联调时，优先使用根目录脚本管理容器，避免命令不一致导致环境漂移。

## 故障排查

### 1) 表不存在 / migration 相关错误

```bash
bash restart-backend.sh
docker logs -f novel_ai_backend
```

若仍失败：

```bash
docker exec -it novel_ai_backend bash
python manage.py showmigrations
python manage.py migrate
```

### 2) AI 接口报 API key 未配置

- API key 为用户级配置，不在 `.env` 中配置。
- 登录后在设置页填写并保存。

### 3) 端口/访问问题

- 检查容器是否在运行：

```bash
docker ps | grep novel_ai_backend
```

## 相关文档

- 根文档：`../README.md`
- AI 提示词文档：`apps/ai_services/PROMPTS_README.md`