#!/bin/bash
echo "🛑 Stopping all services..."
docker rm -f novel_ai_frontend novel_ai_backend novel_ai_redis novel_ai_postgres 2>/dev/null || true
echo "✅ All services stopped!"
