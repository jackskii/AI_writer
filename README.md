# AI 小说写作助手 (AI Novel Writing Assistant)

这是一个基于AI的中文小说写作辅助软件，旨在通过智能提示、建议和聊天功能来帮助作者创作小说。

## 功能特性

- **智能写作辅助**: 实时AI提示和建议
- **AI聊天机器人**: 可访问您故事内容的智能助手
- **自动章节总结**: AI自动生成章节摘要
- **世界观管理**: 完整的设定和角色管理系统
- **实时保存**: 5秒自动保存，防止内容丢失
- **深色主题**: 护眼的专业写作界面

## 技术栈

### 后端
- Django 5.0 + Django REST Framework
- PostgreSQL 16
- Django Channels (WebSocket)
- Redis (缓存和消息队列)
- DeepSeek API 集成

### 前端
- React 18 + TypeScript
- Tailwind CSS (深色主题)
- Zustand (状态管理)
- React Query (数据获取)

## 项目结构

```
AI_writer/
├── backend/            # Django 后端
├── frontend/           # React 前端
├── docs/              # 项目文档
├── docker-compose.yml # Docker 配置
└── README.md          # 项目说明
```

## 快速开始

### 环境要求
- Python 3.11+
- Node.js 18+
- PostgreSQL 16
- Redis

### 后端设置
```bash
cd backend
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

### 前端设置
```bash
cd frontend
npm install
npm run dev
```

## 开发状态

🚧 项目正在开发中...

## 许可证

MIT License