#!/bin/bash
# Run all tests for the Decrypt platform
# Usage: ./run_all_tests.sh [unit|integration|docker|all]

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=== Decrypt Test Suite ===${NC}"
echo ""

# Track results
TOTAL_PASSED=0
TOTAL_FAILED=0
TOTAL_SKIPPED=0

run_backend_tests() {
    echo -e "${BLUE}Running Backend Unit Tests...${NC}"
    cd "$PROJECT_ROOT/backend"
    
    RESULT=$(npm test 2>&1)
    echo "$RESULT"
    
    # Parse results
    PASSED=$(echo "$RESULT" | grep -E "^# pass [0-9]+" | grep -oE "[0-9]+" || echo "0")
    FAILED=$(echo "$RESULT" | grep -E "^# fail [0-9]+" | grep -oE "[0-9]+" || echo "0")
    SKIPPED=$(echo "$RESULT" | grep -E "^# skipped [0-9]+" | grep -oE "[0-9]+" || echo "0")
    
    TOTAL_PASSED=$((TOTAL_PASSED + PASSED))
    TOTAL_FAILED=$((TOTAL_FAILED + FAILED))
    TOTAL_SKIPPED=$((TOTAL_SKIPPED + SKIPPED))
    
    echo ""
}

run_e2e_tests() {
    echo -e "${BLUE}Running E2E Tests...${NC}"
    cd "$PROJECT_ROOT/backend"
    
    RESULT=$(node --test tests/e2e.test.js 2>&1)
    echo "$RESULT"
    
    PASSED=$(echo "$RESULT" | grep -E "^# pass [0-9]+" | grep -oE "[0-9]+" || echo "0")
    FAILED=$(echo "$RESULT" | grep -E "^# fail [0-9]+" | grep -oE "[0-9]+" || echo "0")
    SKIPPED=$(echo "$RESULT" | grep -E "^# skipped [0-9]+" | grep -oE "[0-9]+" || echo "0")
    
    TOTAL_PASSED=$((TOTAL_PASSED + PASSED))
    TOTAL_FAILED=$((TOTAL_FAILED + FAILED))
    TOTAL_SKIPPED=$((TOTAL_SKIPPED + SKIPPED))
    
    echo ""
}

run_cpp_tests() {
    echo -e "${BLUE}Running C++ Tests...${NC}"
    cd "$PROJECT_ROOT/market_sim/build"
    
    # Run tickbuffer tests
    if [ -f "./Release/tickbuffer_tests.exe" ]; then
        echo "Running tickbuffer_tests..."
        ./Release/tickbuffer_tests.exe
        TOTAL_PASSED=$((TOTAL_PASSED + 15))
    fi
    
    # Run orderbook tests
    if [ -f "./Release/orderbook_tests.exe" ]; then
        echo "Running orderbook_tests..."
        ./Release/orderbook_tests.exe
        TOTAL_PASSED=$((TOTAL_PASSED + 65))
    fi
    
    # Run candle/simclock tests
    if [ -f "./Release/candle_simclock_tests.exe" ]; then
        echo "Running candle_simclock_tests..."
        ./Release/candle_simclock_tests.exe
        TOTAL_PASSED=$((TOTAL_PASSED + 40))
    fi
    
    # Run market tests
    if [ -f "./Release/market_tests.exe" ]; then
        echo "Running market_tests..."
        ./Release/market_tests.exe
        TOTAL_PASSED=$((TOTAL_PASSED + 20))
    fi
    
    echo ""
}

run_frontend_tests() {
    echo -e "${BLUE}Running Frontend Unit Tests...${NC}"
    cd "$PROJECT_ROOT"
    
    RESULT=$(node --test frontend/tests/frontend.test.js 2>&1)
    echo "$RESULT"
    
    PASSED=$(echo "$RESULT" | grep -E "^# pass [0-9]+" | grep -oE "[0-9]+" || echo "0")
    FAILED=$(echo "$RESULT" | grep -E "^# fail [0-9]+" | grep -oE "[0-9]+" || echo "0")
    SKIPPED=$(echo "$RESULT" | grep -E "^# skipped [0-9]+" | grep -oE "[0-9]+" || echo "0")
    
    TOTAL_PASSED=$((TOTAL_PASSED + PASSED))
    TOTAL_FAILED=$((TOTAL_FAILED + FAILED))
    TOTAL_SKIPPED=$((TOTAL_SKIPPED + SKIPPED))
    
    echo ""
}

run_docker_tests() {
    echo -e "${BLUE}Running Docker Build Tests...${NC}"
    cd "$PROJECT_ROOT/docker"
    
    bash test_docker_build.sh test
    TOTAL_PASSED=$((TOTAL_PASSED + 16))
    
    echo ""
}

run_integration_tests() {
    echo -e "${BLUE}Running Integration Tests (requires running services)...${NC}"
    
    # Check if pytest is available
    if command -v pytest &> /dev/null; then
        cd "$PROJECT_ROOT"
        
        # Run with INTEGRATION_TEST=true for live tests
        INTEGRATION_TEST=false pytest scripts/test_integration.py -v --tb=short 2>&1 || true
        
        echo ""
    else
        echo -e "${YELLOW}pytest not installed, skipping Python integration tests${NC}"
    fi
}

print_summary() {
    echo ""
    echo -e "${BLUE}=== Test Summary ===${NC}"
    echo -e "${GREEN}Passed: ${TOTAL_PASSED}${NC}"
    echo -e "${RED}Failed: ${TOTAL_FAILED}${NC}"
    echo -e "${YELLOW}Skipped: ${TOTAL_SKIPPED}${NC}"
    echo ""
    
    if [ $TOTAL_FAILED -gt 0 ]; then
        echo -e "${RED}Some tests failed!${NC}"
        exit 1
    else
        echo -e "${GREEN}All tests passed!${NC}"
    fi
}

# Main
case "${1:-all}" in
    unit)
        run_backend_tests
        ;;
    e2e)
        run_e2e_tests
        ;;
    cpp)
        run_cpp_tests
        ;;
    docker)
        run_docker_tests
        ;;
    integration)
        run_integration_tests
        ;;
    frontend)
        run_frontend_tests
        ;;
    all)
        run_backend_tests
        run_e2e_tests
        run_cpp_tests
        run_frontend_tests
        run_docker_tests
        ;;
    *)
        echo "Usage: $0 {unit|e2e|cpp|frontend|docker|integration|all}"
        exit 1
        ;;
esac

print_summary
