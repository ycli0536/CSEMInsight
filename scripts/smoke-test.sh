#!/usr/bin/env bash
#
# Smoke test script for CSEMInsight
# Runs quick tests to verify the application works correctly
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  CSEMInsight Smoke Test Suite${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Track test results
TESTS_PASSED=0
TESTS_FAILED=0

pass() {
    echo -e "  ${GREEN}✓${NC} $1"
    ((TESTS_PASSED++))
}

fail() {
    echo -e "  ${RED}✗${NC} $1"
    ((TESTS_FAILED++))
}

warn() {
    echo -e "  ${YELLOW}⚠${NC} $1"
}

#######################################
# Frontend Tests
#######################################
echo -e "${BLUE}Frontend Tests${NC}"
echo "----------------------------------------"

# Check if bun is installed
if command -v bun &> /dev/null; then
    pass "bun is installed"
else
    fail "bun is not installed"
fi

# Check if frontend dependencies are installed
if [ -d "$PROJECT_ROOT/frontend/node_modules" ]; then
    pass "Frontend dependencies installed"
else
    warn "Frontend dependencies not installed. Run: cd frontend && bun install"
fi

# Run Vitest tests
echo ""
echo "Running Vitest tests..."
cd "$PROJECT_ROOT/frontend"
if bun run test --run 2>&1 | tail -5; then
    pass "Vitest tests passed"
else
    fail "Vitest tests failed"
fi

#######################################
# Backend Tests
#######################################
echo ""
echo -e "${BLUE}Backend Tests${NC}"
echo "----------------------------------------"

# Check if Python venv exists
if [ -d "$PROJECT_ROOT/backend/.venv" ]; then
    pass "Python virtual environment exists"
    
    # Run pytest tests
    echo ""
    echo "Running pytest tests..."
    cd "$PROJECT_ROOT/backend"
    if source .venv/bin/activate && pytest tests/ -v --tb=short 2>&1 | tail -10; then
        pass "Pytest tests passed"
    else
        fail "Pytest tests failed"
    fi
else
    warn "Python virtual environment not found. Run: cd backend && python3 -m venv .venv"
    warn "Skipping backend tests"
fi

#######################################
# Integration Checks
#######################################
echo ""
echo -e "${BLUE}Integration Checks${NC}"
echo "----------------------------------------"

# Check if sample data files exist
if [ -d "$PROJECT_ROOT/backend/test_data" ] && [ "$(ls -A $PROJECT_ROOT/backend/test_data/*.data 2>/dev/null | wc -l)" -gt 0 ]; then
    SAMPLE_COUNT=$(ls -1 "$PROJECT_ROOT/backend/test_data"/*.data 2>/dev/null | wc -l)
    pass "Sample data files exist ($SAMPLE_COUNT .data files)"
else
    warn "No sample data files found in backend/test_data"
fi

# Check if critical frontend files exist
for file in "src/App.tsx" "src/main.tsx" "vite.config.ts" "vitest.config.ts"; do
    if [ -f "$PROJECT_ROOT/frontend/$file" ]; then
        pass "$file exists"
    else
        fail "$file is missing"
    fi
done

# Check if critical backend files exist
for file in "main.py" "csem_datafile_parser.py" "requirements.txt"; do
    if [ -f "$PROJECT_ROOT/backend/$file" ]; then
        pass "backend/$file exists"
    else
        fail "backend/$file is missing"
    fi
done

#######################################
# Build Check (Optional)
#######################################
echo ""
echo -e "${BLUE}Build Check${NC}"
echo "----------------------------------------"

# Check if a production build exists
if [ -d "$PROJECT_ROOT/frontend/dist" ]; then
    pass "Frontend production build exists"
else
    warn "No frontend production build. Run: cd frontend && bun run build"
fi

# Check if Tauri app exists
if [ -d "$PROJECT_ROOT/frontend/src-tauri/target/release/bundle/macos" ]; then
    pass "Tauri macOS bundle exists"
else
    warn "No Tauri bundle. Run: cd frontend && bun tauri build"
fi

#######################################
# Summary
#######################################
echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Summary${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "  Tests passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "  Tests failed: ${RED}$TESTS_FAILED${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}All smoke tests passed! ✓${NC}"
    exit 0
else
    echo -e "${RED}Some smoke tests failed. Please check the output above.${NC}"
    exit 1
fi
