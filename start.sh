#!/bin/bash
set -e

echo "🚀 AI Novel Writing Assistant - Quick Start"
echo "=========================================="
echo ""

if [ ! -f .env ]; then
    echo "⚠️  No .env file found. Creating from .env.example..."
    cp .env.example .env
    echo "✅ Created .env file"
    echo ""
    echo "ℹ️  Note: DeepSeek API keys are configured per-user in account settings"
    echo "   You can set your API key after logging in to the application"
    echo ""
fi

if ! command -v docker-compose &> /dev/null; then
    echo "❌ docker-compose not found. Please install Docker and Docker Compose first."
    exit 1
fi

echo "📦 Starting Docker services..."
docker-compose up -d

echo ""
echo "⏳ Waiting for services to be ready..."
sleep 5

echo ""
echo "✅ Services started successfully!"
echo ""
echo "🌐 Access the application:"
echo "   Frontend:  http://localhost:3000"
echo "   Backend:   http://localhost:8001"
echo ""
echo "📝 Useful commands:"
echo "   View logs:        docker-compose logs -f"
echo "   Stop services:    docker-compose down"
echo "   Restart:          docker-compose restart"
echo ""
echo "Happy writing! 📚✨"
