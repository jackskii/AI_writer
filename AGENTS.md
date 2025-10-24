# Repository Guidelines

## Project Structure & Module Organization
This repo pairs a Django REST backend (`backend/`) with a Vite + React frontend (`frontend/`). Backend domain apps live under `backend/apps/` (`works`, `ai_services`, `chat`, `notes`) with shared settings in `backend/novel_ai/` and auth helpers in `authentication/`. Frontend feature code is in `src/components/`, state in `src/stores/`, API clients in `src/services/`, and shared types in `src/types/`. `CLAUDE.md` still links to Monaco-era docs; compare them with the current textarea editor and selection-based note tracking.

## Build, Test, and Development Commands
- `cd backend && pip install -r requirements.txt`
- `cd backend && python manage.py migrate`
- `cd backend && python manage.py runserver 0.0.0.0:8001`
- `cd backend && python manage.py test` (add `coverage run --source=apps manage.py test` for metrics)
- `cd frontend && npm install`
- `cd frontend && npm run dev` / `npm run build` / `npm run lint`
- `docker-compose up -d`

## Coding Style & Naming Conventions
Python uses 4-space indentation, snake_case modules, and Django REST groupings inside each app; async integrations stay in `apps/ai_services/services.py` and shared helpers in `apps/core`. TypeScript files are PascalCase for components, `use*` for hooks, camelCase for store selectors, and Tailwind utilities for styling. Run `npm run lint` and keep Python imports explicit.

## Testing Guidelines
- Extend the touched app’s `tests.py`, naming cases `test_<behavior>` and using `setUpTestData` for fixtures.
- Use `coverage report` when backend logic changes, and add Vitest/RTL specs under `src/__tests__/` or beside the component when UI risks rise.

## Critical Systems & Safety Rules
- Maintain the textarea-driven editor: preserve `adjustPositions`, `notePositions`, and auto-edit maps so selections stay in sync; test note highlighting after edits.
- Whenever you change streaming or auth code, re-run both HTTP and `/stream/` flows and confirm EventSource token query parameters still authorize.
- AI context changes must cap payload size, limit lore selection, and preserve HTTP fallbacks; review the streaming docs even though some Monaco notes are historical.

## Commit & Pull Request Guidelines
Match the repo’s short, imperative commit subjects (`fix textbox ui`, `backend: refresh lore triggers`). Group related edits, skip drive-by formatting, mention issue IDs when relevant, and in PRs note the change, verification commands, and any UI evidence.

## Environment & Configuration Tips
Copy `backend/.env.example` to `.env`, fill `DEEPSEEK_API_KEY`, `DEEPSEEK_API_BASE`, `SECRET_KEY`, and database settings. Use Redis from `docker-compose.yml`, keep secrets and SQLite out of commits, and spot-check SSE token auth after changes.
