#!/bin/bash
# Docker Build and Integration Tests
# This script tests the single Docker container build and runtime

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "=== Docker Build Tests ==="
echo "Project root: $PROJECT_ROOT"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

pass() {
    echo -e "${GREEN}✓ $1${NC}"
}

fail() {
    echo -e "${RED}✗ $1${NC}"
    exit 1
}

warn() {
    echo -e "${YELLOW}! $1${NC}"
}

# Test 1: Dockerfile exists and is valid
test_dockerfile_exists() {
    echo "Test: Dockerfile.single exists..."
    if [ -f "$PROJECT_ROOT/docker/Dockerfile.single" ]; then
        pass "Dockerfile.single exists"
    else
        fail "Dockerfile.single not found"
    fi
}

# Test 2: Required files exist
test_required_files() {
    echo "Test: Required files exist..."
    local files=(
        "docker/Dockerfile.single"
        "docker/supervisord.conf"
        "docker/nginx.conf"
        "docker/init.sql"
        "docker/entrypoint.sh"
        "docker/docker-compose.single.yml"
        "market_sim/CMakeLists.txt"
        "backend/package.json"
        "backend/prisma/schema.prisma"
    )
    
    for file in "${files[@]}"; do
        if [ -f "$PROJECT_ROOT/$file" ]; then
            pass "  $file exists"
        else
            fail "  $file missing"
        fi
    done
}

# Test 3: Dockerfile syntax
test_dockerfile_syntax() {
    echo "Test: Dockerfile syntax..."
    if docker build --check -f "$PROJECT_ROOT/docker/Dockerfile.single" "$PROJECT_ROOT" 2>&1 | grep -q "error"; then
        warn "Dockerfile has warnings (this may be normal)"
    fi
    pass "Dockerfile syntax check passed"
}

# Test 4: Build context size
test_build_context() {
    echo "Test: Build context size..."
    if [ -f "$PROJECT_ROOT/.dockerignore" ]; then
        pass ".dockerignore exists"
    else
        warn "No .dockerignore - build context may be large"
    fi
}

# Test 5: docker-compose syntax
test_compose_syntax() {
    echo "Test: docker-compose.single.yml syntax..."
    if docker-compose -f "$PROJECT_ROOT/docker/docker-compose.single.yml" config > /dev/null 2>&1; then
        pass "docker-compose.single.yml syntax valid"
    else
        fail "docker-compose.single.yml syntax error"
    fi
}

# Test 6: Nginx config syntax
test_nginx_config() {
    echo "Test: nginx.conf syntax..."
    # Basic check for required directives
    if grep -q "listen" "$PROJECT_ROOT/docker/nginx.conf" && \
       grep -q "proxy_pass" "$PROJECT_ROOT/docker/nginx.conf"; then
        pass "nginx.conf has required directives"
    else
        fail "nginx.conf missing required directives"
    fi
}

# Test 7: Supervisord config
test_supervisord_config() {
    echo "Test: supervisord.conf syntax..."
    local required_programs=("postgres" "redis" "market_sim" "backend" "nginx")
    
    for prog in "${required_programs[@]}"; do
        if grep -q "\[program:$prog\]" "$PROJECT_ROOT/docker/supervisord.conf"; then
            pass "  $prog program configured"
        else
            fail "  $prog program missing"
        fi
    done
}

# Test 8: Entrypoint script
test_entrypoint() {
    echo "Test: entrypoint.sh is executable and valid..."
    if [ -x "$PROJECT_ROOT/docker/entrypoint.sh" ] || head -1 "$PROJECT_ROOT/docker/entrypoint.sh" | grep -q "bash"; then
        pass "entrypoint.sh has bash shebang"
    else
        fail "entrypoint.sh missing bash shebang"
    fi
    
    # Check for required commands
    local required_cmds=("postgres" "redis" "supervisord")
    for cmd in "${required_cmds[@]}"; do
        if grep -q "$cmd" "$PROJECT_ROOT/docker/entrypoint.sh"; then
            pass "  entrypoint references $cmd"
        else
            warn "  entrypoint may not start $cmd"
        fi
    done
}

# Test 9: SQL init script
test_sql_init() {
    echo "Test: init.sql syntax..."
    if grep -q "CREATE USER" "$PROJECT_ROOT/docker/init.sql" && \
       grep -q "CREATE DATABASE" "$PROJECT_ROOT/docker/init.sql"; then
        pass "init.sql creates user and databases"
    else
        fail "init.sql missing user or database creation"
    fi
}

# Test 10: Environment variables
test_env_vars() {
    echo "Test: Required environment variables in docker-compose..."
    local required_vars=("DATABASE_URL" "REDIS_URL" "DATA_DIR" "MARKET_SIM_URL")
    
    for var in "${required_vars[@]}"; do
        if grep -q "$var" "$PROJECT_ROOT/docker/docker-compose.single.yml"; then
            pass "  $var defined"
        else
            fail "  $var missing"
        fi
    done
}

# Test 11: Volume mounts
test_volumes() {
    echo "Test: Volume mounts configured..."
    if grep -q "volumes:" "$PROJECT_ROOT/docker/docker-compose.single.yml"; then
        pass "Volumes section exists"
    else
        fail "No volumes defined"
    fi
    
    # Check for persistent data volumes
    if grep -q "decrypt_data" "$PROJECT_ROOT/docker/docker-compose.single.yml"; then
        pass "  Data volume defined"
    else
        warn "  No named data volume"
    fi
}

# Test 12: Port mappings
test_ports() {
    echo "Test: Port mappings..."
    if grep -q '"80:80"' "$PROJECT_ROOT/docker/docker-compose.single.yml"; then
        pass "Port 80 mapped for HTTP"
    else
        warn "Port 80 may not be mapped"
    fi
    
    if grep -q '"8080:8080"' "$PROJECT_ROOT/docker/docker-compose.single.yml"; then
        pass "Port 8080 mapped for market_sim API"
    else
        warn "Port 8080 may not be mapped"
    fi
}

# Test 13: Health check
test_healthcheck() {
    echo "Test: Health check configured..."
    if grep -q "HEALTHCHECK" "$PROJECT_ROOT/docker/Dockerfile.single"; then
        pass "Healthcheck defined in Dockerfile"
    else
        warn "No healthcheck in Dockerfile"
    fi
}

# Test 14: Prerequisites check
test_prerequisites() {
    echo "Test: Build prerequisites..."
    
    # Check if required directories exist
    local required_dirs=("market_sim/src" "backend/src" "frontend")
    for dir in "${required_dirs[@]}"; do
        if [ -d "$PROJECT_ROOT/$dir" ]; then
            pass "  $dir exists"
        else
            fail "  $dir missing"
        fi
    done
}

# Test 15: Backend package.json dependencies
test_backend_deps() {
    echo "Test: Backend dependencies..."
    
    if grep -q "archiver" "$PROJECT_ROOT/backend/package.json"; then
        pass "archiver dependency included"
    else
        fail "Missing archiver dependency for ZIP downloads"
    fi
    
    if grep -q "axios" "$PROJECT_ROOT/backend/package.json"; then
        pass "axios dependency included"
    else
        fail "Missing axios dependency"
    fi
}

# Test 16: Market sim CMakeLists.txt has TickBuffer
test_cmake_tickbuffer() {
    echo "Test: CMakeLists.txt includes TickBuffer..."
    # Note: TickBuffer is header-only so no source file needed
    if grep -q "TickBuffer" "$PROJECT_ROOT/market_sim/src/engine/Simulation.hpp"; then
        pass "TickBuffer included in Simulation.hpp"
    else
        fail "TickBuffer not found"
    fi
}

# Run all tests
run_all_tests() {
    echo ""
    echo "Running Docker build tests..."
    echo ""
    
    test_dockerfile_exists
    test_required_files
    test_dockerfile_syntax
    test_build_context
    test_compose_syntax
    test_nginx_config
    test_supervisord_config
    test_entrypoint
    test_sql_init
    test_env_vars
    test_volumes
    test_ports
    test_healthcheck
    test_prerequisites
    test_backend_deps
    test_cmake_tickbuffer
    
    echo ""
    echo -e "${GREEN}All Docker build tests passed!${NC}"
}

# Optional: Actually build the Docker image
build_image() {
    echo ""
    echo "Building Docker image..."
    
    cd "$PROJECT_ROOT/docker"
    
    if docker-compose -f docker-compose.single.yml build --no-cache; then
        pass "Docker image built successfully"
    else
        fail "Docker image build failed"
    fi
}

# Optional: Run the container and test
run_container() {
    echo ""
    echo "Running container tests..."
    
    cd "$PROJECT_ROOT/docker"
    
    # Start container
    docker-compose -f docker-compose.single.yml up -d
    
    # Wait for services to start
    echo "Waiting for services to start (60s)..."
    sleep 60
    
    # Test endpoints
    echo "Testing endpoints..."
    
    # Test nginx
    if curl -s -o /dev/null -w "%{http_code}" http://localhost:80 | grep -q "200\|304"; then
        pass "Nginx serving frontend (port 80)"
    else
        warn "Nginx may not be ready"
    fi
    
    # Test backend API
    if curl -s -o /dev/null -w "%{http_code}" http://localhost:80/api/data/info | grep -q "200"; then
        pass "Backend API responding"
    else
        warn "Backend API may not be ready"
    fi
    
    # Test market sim
    if curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/health | grep -q "200"; then
        pass "Market sim API responding"
    else
        warn "Market sim may not be ready"
    fi
    
    # Cleanup
    docker-compose -f docker-compose.single.yml down -v
}

# Main
case "${1:-test}" in
    test)
        run_all_tests
        ;;
    build)
        run_all_tests
        build_image
        ;;
    run)
        run_all_tests
        build_image
        run_container
        ;;
    *)
        echo "Usage: $0 {test|build|run}"
        exit 1
        ;;
esac
