# AI 小说写作助手 - 详细文档

## 项目概述

这是一个基于AI的中文小说写作辅助软件，旨在通过智能提示、建议和聊天功能来帮助作者创作小说。

## 核心功能

### 🎯 主要特性
- **智能写作辅助**: 实时AI提示和建议，5秒自动保存，300字触发自动建议
- **三栏编辑器**: 编辑器 + 笔记 + 聊天的完美布局
- **AI聊天机器人**: 可访问您故事内容的智能助手
- **自动章节总结**: AI自动生成章节摘要
- **世界观管理**: 完整的设定和角色管理系统，支持触发词匹配
- **实时保存**: 防止内容丢失
- **深色主题**: 护眼的专业写作界面

### 🤖 四个AI助手
1. **通用聊天AI** (deepseek-reasoner) - 基于作品内容的智能对话
2. **续写AI** (deepseek-reasoner) - 根据上下文和引导续写
3. **建议AI** (deepseek-chat) - 自动/手动写作建议生成
4. **总结AI** (deepseek-chat) - 章节内容总结

## 技术栈

### 后端
- **Django 5.0** + Django REST Framework
- **PostgreSQL 16** (开发时使用SQLite)
- **Django Channels** (WebSocket支持)
- **Redis** (缓存和消息队列)
- **DeepSeek API** 集成

### 前端
- **React 18** + TypeScript
- **Tailwind CSS** (深色主题)
- **Zustand** (状态管理)
- **React Query** (数据获取)
- **Monaco Editor** (代码编辑器)

## 项目结构

```
AI_writer/
├── backend/                    # Django 后端
│   ├── novel_ai/              # Django项目配置
│   ├── apps/                  # Django应用
│   │   ├── works/             # 作品和章节管理
│   │   ├── ai_services/       # AI服务和建议
│   │   ├── chat/              # 聊天和消息
│   │   └── notes/             # 笔记系统
│   ├── requirements.txt       # Python依赖
│   └── manage.py             # Django管理脚本
├── frontend/                  # React 前端
│   ├── src/
│   │   ├── components/        # React组件
│   │   │   ├── ui/           # 基础UI组件
│   │   │   ├── editor/       # 编辑器组件
│   │   │   └── modals/       # 弹窗组件
│   │   ├── pages/            # 页面组件
│   │   ├── services/         # API服务
│   │   ├── stores/           # 状态管理
│   │   ├── types/            # TypeScript类型
│   │   └── utils/            # 工具函数
│   ├── package.json          # Node.js依赖
│   └── tailwind.config.js    # Tailwind配置
├── docs/                     # 项目文档
├── docker-compose.yml        # Docker配置
└── README.md                 # 项目说明
```

## 数据模型

### 核心模型

#### Work (作品)
- `title`: 作品标题
- `synopsis`: 作品大纲
- `author`: 作者 (Django User)
- `word_count`: 总字数 (计算属性)
- `chapter_count`: 章节数量 (计算属性)

#### Chapter (章节)
- `work`: 所属作品
- `title`: 章节标题
- `content`: 章节内容
- `order`: 排序序号
- `summary`: AI生成的摘要
- `word_count`: 字数统计 (中文字符)
- `last_autosave`: 最后自动保存时间

#### LoreEntry (世界观条目)
- `work`: 所属作品
- `name`: 条目名称
- `description`: 详细描述
- `triggers`: 触发词列表
- `extra_triggers`: 额外触发词
- `all_triggers`: 所有触发词 (计算属性)

#### Note (笔记)
- `work`: 所属作品
- `chapter`: 所属章节
- `content`: 笔记内容
- `color`: 颜色标记
- `text_start_position`: 关联文本开始位置
- `text_end_position`: 关联文本结束位置
- `is_ai_generated`: AI生成标记
- `note_type`: 笔记类型

## API 端点

### 作品管理
- `GET /api/works/` - 获取作品列表
- `POST /api/works/` - 创建作品
- `GET /api/works/{id}/` - 获取作品详情
- `PATCH /api/works/{id}/` - 更新作品

### 章节管理
- `GET /api/works/{work_id}/chapters/` - 获取章节列表
- `POST /api/works/{work_id}/chapters/` - 创建章节
- `GET /api/works/{work_id}/chapters/{id}/` - 获取章节详情
- `PATCH /api/works/{work_id}/chapters/{id}/` - 更新章节
- `PATCH /api/works/{work_id}/chapters/{id}/autosave/` - 自动保存
- `POST /api/works/{work_id}/chapters/{id}/summary/` - 生成摘要

### AI 服务
- `POST /api/ai/chat/` - AI聊天
- `POST /api/ai/continue/` - AI续写
- `POST /api/ai/suggest/` - AI建议
- `POST /api/ai/summarize/` - AI总结

### 笔记管理
- `GET /api/notes/` - 获取笔记列表 (支持筛选)
- `POST /api/notes/` - 创建笔记
- `PATCH /api/notes/{id}/` - 更新笔记
- `DELETE /api/notes/{id}/` - 删除笔记

## AI 上下文管理

AI服务使用智能上下文构建系统：

1. **基础上下文**: 作品大纲、当前章节标题和内容
2. **世界观条目**: 根据内容中的触发词自动加载相关设定
3. **历史章节**: 最近5章的AI生成摘要
4. **用户指导**: 续写时的具体指导内容

## 自动化功能

### 自动保存
- 每5秒自动保存编辑器内容
- 实时显示保存状态
- 支持手动保存

### 自动建议
- 新增300字时自动触发AI建议
- 手动选择文本请求建议
- 建议保存到笔记系统

### 触发词系统
- 世界观条目支持多个触发词
- 智能匹配当前内容和历史内容
- 自动为AI提供相关背景信息

## 用户界面

### 深色主题设计
- 护眼的深色配色方案
- 专业的写作体验
- 中文字体优化

### 三栏布局
1. **左侧编辑器**: 主要写作区域，支持实时编辑和AI续写
2. **右上笔记**: 颜色编码笔记，支持文本关联
3. **右下聊天**: AI助手对话，可访问完整故事上下文

### 响应式设计
- 适配不同屏幕尺寸
- 流畅的交互体验
- 快捷键支持

## 开发和部署

### 开发环境设置

1. **后端设置**
```bash
cd backend
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

2. **前端设置**
```bash
cd frontend
npm install
npm run dev
```

3. **环境变量**
创建 `backend/.env` 文件：
```
DEBUG=True
SECRET_KEY=your-secret-key
DEEPSEEK_API_KEY=your-deepseek-api-key
```

### 生产部署

使用Docker Compose:
```bash
docker-compose up -d
```

## 未来增强

### WebSocket实时功能 (计划中)
- 实时聊天消息推送
- 多用户协作编辑
- 实时建议通知

### 高级功能 (路线图)
- 多语言支持
- 语音输入
- 导出功能 (PDF, EPUB)
- 版本控制
- 云端同步

## 安全和隐私

- 用户认证和授权
- API密钥安全存储
- 数据加密传输
- 内容隐私保护

## 贡献指南

1. Fork 项目
2. 创建特性分支
3. 提交更改
4. 推送到分支
5. 创建Pull Request

## 许可证

MIT License - 详见 LICENSE 文件

## 支持

如有问题或建议，请创建 Issue 或联系开发团队。

---

**AI小说写作助手** - 让创作更智能，让想象力飞翔！