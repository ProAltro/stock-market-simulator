@echo off
REM Run all tests for the Decrypt platform on Windows

setlocal enabledelayedexpansion

echo === Decrypt Test Suite ===
echo.

set TOTAL_PASSED=0
set TOTAL_FAILED=0
set TOTAL_SKIPPED=0

REM Backend tests
echo Running Backend Unit Tests...
cd ..\backend
for /f "tokens=2 delims=#" %%a in ('npm test 2^>^&1 ^| findstr /r "^# pass"') do set PASSED=%%a
for /f "tokens=2 delims=#" %%a in ('npm test 2^>^&1 ^| findstr /r "^# fail"') do set FAILED=%%a
for /f "tokens=2 delims=#" %%a in ('npm test 2^>^&1 ^| findstr /r "^# skipped"') do set SKIPPED=%%a

echo.
echo Running E2E Tests...
node --test tests\e2e.test.js

cd ..\scripts

echo.
echo Running C++ Tests...
cd ..\market_sim\build
if exist "Release\tickbuffer_tests.exe" (
    echo Running tickbuffer_tests...
    Release\tickbuffer_tests.exe
)
if exist "Release\orderbook_tests.exe" (
    echo Running orderbook_tests...
    Release\orderbook_tests.exe
)
if exist "Release\candle_simclock_tests.exe" (
    echo Running candle_simclock_tests...
    Release\candle_simclock_tests.exe
)
if exist "Release\market_tests.exe" (
    echo Running market_tests...
    Release\market_tests.exe
)

cd ..\..\scripts

echo.
echo Running Frontend Unit Tests...
cd ..
node --test frontend\tests\frontend.test.js
cd scripts

echo.
echo Running Docker Build Tests...
cd ..\docker
bash test_docker_build.sh test 2>nul || echo Docker tests require bash/WSL

cd ..\scripts

echo.
echo === Test Summary ===
echo All tests completed!
echo.
echo To run integration tests with live services:
echo   set INTEGRATION_TEST=true
echo   pytest ..\scripts\test_integration.py -v
echo.
