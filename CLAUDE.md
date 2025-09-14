# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI Novel Writing Assistant (AI 小说写作助手) - A Chinese AI-powered novel writing tool with intelligent suggestions, chat features, and world-building management.

## Development Commands

### Backend (Django)
```bash
cd backend
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver  # Runs on http://localhost:8000

# Testing
python manage.py test

# Environment setup
cp .env.example .env
# Edit .env with DEEPSEEK_API_KEY and other settings
```

### Frontend (React + Vite)
```bash
cd frontend
npm install
npm run dev         # Runs on http://localhost:5173
npm run build       # Build for production
npm run lint        # ESLint checking
npm run preview     # Preview production build
```

### Docker Development
```bash
docker-compose up -d    # Full stack with PostgreSQL and Redis
```

## Architecture Overview

### Backend Structure (Django)
- **apps/works/**: Novel and chapter management (Work, Chapter, LoreEntry models)
- **apps/ai_services/**: AI integration with DeepSeek API (4 different AI assistants)
- **apps/chat/**: WebSocket chat system for AI conversations
- **apps/notes/**: Note-taking system with color coding and text associations

### Frontend Structure (React + TypeScript)
- **components/ui/**: Reusable UI components with Tailwind CSS
- **components/editor/**: Monaco Editor integration for writing
- **pages/**: Main application pages
- **stores/**: Zustand state management
- **services/**: API communication with backend

### AI Integration
Four specialized AI assistants using DeepSeek API:
1. **General Chat AI** (deepseek-reasoner) - Context-aware conversations
2. **Continuation AI** (deepseek-reasoner) - Story continuation based on context
3. **Suggestion AI** (deepseek-chat) - Writing suggestions (auto-triggered at 300 chars)
4. **Summary AI** (deepseek-chat) - Chapter summarization

### Database Schema
**Core Models:**
- `Work`: Novel with title, synopsis, author, computed word/chapter counts
- `Chapter`: Content, order, AI summary, auto-save tracking
- `LoreEntry`: World-building with trigger word matching system
- `Note`: Color-coded notes with text position linking

### Key Features
- **Auto-save**: 5-second intervals with real-time status
- **Three-panel Layout**: Editor + Notes + Chat interface
- **Trigger Word System**: Automatic context loading for AI based on story content
- **WebSocket Support**: Real-time chat and notifications (Django Channels)
- **Dark Theme**: Professional writing interface optimized for Chinese text

### Environment Configuration
Backend requires `.env` file with:
- `DEEPSEEK_API_KEY`: Required for AI functionality
- `DEBUG`: Development mode flag
- `SECRET_KEY`: Django secret key
- Database settings (SQLite in dev, PostgreSQL in production)

### API Endpoints Structure
- `/api/works/`: Work CRUD and management
- `/api/works/{id}/chapters/`: Chapter operations including auto-save
- `/api/ai/`: All AI services (chat, continue, suggest, summarize)
- `/api/notes/`: Note management with filtering support

### Development Notes
- Backend uses SQLite for development, PostgreSQL for production
- Frontend uses Vite for fast development builds
- AI context is intelligently constructed with work outline, recent chapters, and triggered lore entries
- Auto-suggestions trigger after 300 characters of new content
- All AI responses are streamed for better UX