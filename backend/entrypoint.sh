#!/bin/bash
set -e

echo "Waiting for postgres..."
while ! pg_isready -h $DB_HOST -p $DB_PORT -U $DB_USER; do
  sleep 1
done
echo "PostgreSQL is ready!"

echo "Running migrations..."
python manage.py migrate --noinput

echo "Collecting static files..."
python manage.py collectstatic --noinput --clear || true

echo "Starting server..."
exec "$@"
