#!/bin/bash
set -e

# GCP Server Configuration
GCP_IP="34.173.219.255"

echo "🚀 AI Novel Writing Assistant - GCP Deployment"
echo "=============================================="
echo "Server IP: $GCP_IP"
echo ""

# Load environment variables from .env if exists
if [ -f .env ]; then
    set -a
    source .env 2>/dev/null || true
    set +a
fi

# Set defaults (override with GCP-specific values)
DB_NAME=${DB_NAME:-novel_ai_db}
DB_USER=${DB_USER:-novel_user}
DB_PASSWORD=${DB_PASSWORD:-novel_password}
BACKEND_PORT=${BACKEND_PORT:-8001}
FRONTEND_PORT=${FRONTEND_PORT:-3000}
SECRET_KEY=${SECRET_KEY:-your-secret-key-change-this}
DEBUG=${DEBUG:-False}
DEEPSEEK_API_BASE=${DEEPSEEK_API_BASE:-https://api.deepseek.com/v1}

# GCP-specific overrides (use public IP)
ALLOWED_HOSTS="localhost,127.0.0.1,backend,0.0.0.0,${GCP_IP}"
FRONTEND_URL="http://${GCP_IP}:${FRONTEND_PORT}"
VITE_API_URL="http://${GCP_IP}:${BACKEND_PORT}/api"

echo "📋 Configuration:"
echo "   FRONTEND_URL: $FRONTEND_URL"
echo "   VITE_API_URL: $VITE_API_URL"
echo ""

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
    /bin/bash -c "chmod +x /app/entrypoint.sh && /app/entrypoint.sh daphne -b 0.0.0.0 -p 8000 novel_ai.asgi:application"

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
echo "   Frontend:  http://${GCP_IP}:${FRONTEND_PORT}"
echo "   Backend:   http://${GCP_IP}:${BACKEND_PORT}"
echo ""
echo "🔥 Make sure GCP firewall allows ports ${FRONTEND_PORT} and ${BACKEND_PORT}:"
echo "   gcloud compute firewall-rules create allow-ai-writer \\"
echo "     --allow tcp:${FRONTEND_PORT},tcp:${BACKEND_PORT} \\"
echo "     --source-ranges 0.0.0.0/0"
echo ""
echo "📝 Useful commands:"
echo "   View logs:        docker logs -f novel_ai_backend"
echo "   Stop all:         ./stop.sh"
echo "   Restart backend:  docker restart novel_ai_backend"
echo ""
echo "Happy writing! 📚✨"
