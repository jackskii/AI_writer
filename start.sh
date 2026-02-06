#!/bin/bash
set -e

echo "🚀 AI Novel Writing Assistant - Quick Start"
echo "=========================================="
echo ""

# Load environment variables
if [ ! -f .env ]; then
    echo "⚠️  No .env file found. Creating from .env.example..."
    cp .env.example .env
    echo "✅ Created .env file"
fi

# Source .env file
set -a
source .env 2>/dev/null || true
set +a

# Set defaults
DB_NAME=${DB_NAME:-novel_ai_db}
DB_USER=${DB_USER:-novel_user}
DB_PASSWORD=${DB_PASSWORD:-novel_password}
BACKEND_PORT=${BACKEND_PORT:-8001}
FRONTEND_PORT=${FRONTEND_PORT:-3000}
SECRET_KEY=${SECRET_KEY:-your-secret-key-change-this}
# Use * to allow all hosts (or set specific hosts in .env)
ALLOWED_HOSTS=${ALLOWED_HOSTS:-*}
DEBUG=${DEBUG:-True}
DEEPSEEK_API_BASE=${DEEPSEEK_API_BASE:-https://api.deepseek.com/v1}
FRONTEND_URL=${FRONTEND_URL:-http://0.0.0.0:3000}
VITE_API_URL=${VITE_API_URL:-/api}

# Create network if not exists
echo "📡 Creating network..."
docker network create novel_ai_network 2>/dev/null || true

# Create volumes if not exist
echo "📁 Creating volumes..."
docker volume create postgres_data 2>/dev/null || true
docker volume create redis_data 2>/dev/null || true
docker volume create static_volume 2>/dev/null || true
docker volume create media_volume 2>/dev/null || true

# Stop and remove existing containers (if any)
echo "🧹 Cleaning up existing containers..."
docker rm -f novel_ai_postgres novel_ai_redis novel_ai_backend novel_ai_frontend 2>/dev/null || true

# Start PostgreSQL
echo "🐘 Starting PostgreSQL..."
docker run -d \
    --name novel_ai_postgres \
    --network novel_ai_network \
    --network-alias postgres \
    -e POSTGRES_DB=$DB_NAME \
    -e POSTGRES_USER=$DB_USER \
    -e POSTGRES_PASSWORD=$DB_PASSWORD \
    -v postgres_data:/var/lib/postgresql/data \
    --restart unless-stopped \
    postgres:16-alpine

# Start Redis
echo "🔴 Starting Redis..."
docker run -d \
    --name novel_ai_redis \
    --network novel_ai_network \
    --network-alias redis \
    -v redis_data:/data \
    --restart unless-stopped \
    redis:7-alpine redis-server --appendonly yes

# Wait for PostgreSQL to be ready
echo "⏳ Waiting for PostgreSQL to be ready..."
until docker exec novel_ai_postgres pg_isready -U $DB_USER 2>/dev/null; do
    echo "  PostgreSQL not ready yet, waiting..."
    sleep 2
done
echo "✅ PostgreSQL is ready!"

# Wait for Redis to be ready
echo "⏳ Waiting for Redis to be ready..."
until docker exec novel_ai_redis redis-cli ping 2>/dev/null | grep -q PONG; do
    echo "  Redis not ready yet, waiting..."
    sleep 2
done
echo "✅ Redis is ready!"

# Build and start Backend
echo "🔧 Building backend..."
docker build -t novel_ai_backend ./backend

echo "🖥️  Starting Backend..."
docker run -d \
    --name novel_ai_backend \
    --network novel_ai_network \
    --network-alias backend \
    -p ${BACKEND_PORT}:8000 \
    -e DEBUG=$DEBUG \
    -e SECRET_KEY=$SECRET_KEY \
    -e ALLOWED_HOSTS=$ALLOWED_HOSTS \
    -e DB_NAME=$DB_NAME \
    -e DB_USER=$DB_USER \
    -e DB_PASSWORD=$DB_PASSWORD \
    -e DB_HOST=postgres \
    -e DB_PORT=5432 \
    -e DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@postgres:5432/${DB_NAME} \
    -e REDIS_URL=redis://redis:6379/0 \
    -e DEEPSEEK_API_BASE=$DEEPSEEK_API_BASE \
    -e FRONTEND_URL=$FRONTEND_URL \
    -v "$(pwd)/backend:/app" \
    -v static_volume:/app/staticfiles \
    -v media_volume:/app/media \
    --restart unless-stopped \
    novel_ai_backend \
    /bin/bash -c "bash /app/entrypoint.sh daphne -b 0.0.0.0 -p 8000 novel_ai.asgi:application"

# Build and start Frontend
echo "🔧 Building frontend..."
docker build -t novel_ai_frontend --build-arg VITE_API_URL=$VITE_API_URL ./frontend

echo "🌐 Starting Frontend..."
docker run -d \
    --name novel_ai_frontend \
    --network novel_ai_network \
    -p ${FRONTEND_PORT}:80 \
    --restart unless-stopped \
    novel_ai_frontend

echo ""
echo "✅ All services started successfully!"
echo ""
echo "🌐 Access the application:"
echo "   Frontend:  http://0.0.0.0:${FRONTEND_PORT}"
echo "   Backend:   http://0.0.0.0:${BACKEND_PORT}"
echo ""
echo "📝 Useful commands:"
echo "   View logs:        docker logs -f novel_ai_backend"
echo "   Stop all:         ./stop.sh"
echo "   Restart backend:  docker restart novel_ai_backend"
echo ""
echo "Happy writing! 📚✨"
