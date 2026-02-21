#!/bin/bash
set -e

echo "Starting Decrypt Platform..."

# Create necessary directories
mkdir -p /data
mkdir -p /var/log/supervisor
mkdir -p /run/nginx

# Start Redis
echo "Starting Redis..."
redis-server --daemonize yes

# Wait for Redis
sleep 1

# Wait for PostgreSQL to be ready
echo "Waiting for PostgreSQL..."
until pg_isready -h postgres -U decrypt -d decrypt; do
    echo "PostgreSQL is unavailable - sleeping"
    sleep 2
done

echo "PostgreSQL is up!"

# Run Prisma migration
echo "Running Prisma migrations..."
cd /app/backend
npx prisma db push --skip-generate 2>/dev/null || true

# Start supervisord
echo "Starting supervisord..."
exec /usr/bin/supervisord -c /etc/supervisord.conf
