@echo off
setlocal enabledelayedexpansion

REM CSEMInsight Cross-Platform Setup Script (Windows)
echo 🌊 Setting up CSEMInsight - Marine CSEM Data Visualization Toolkit
echo ==================================================================

REM Check if Node.js is installed
node --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Node.js is not installed. Please install Node.js (v22+) first.
    echo    Download from: https://nodejs.org/
    pause
    exit /b 1
)

REM Check if Python is installed
python --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Python is not installed. Please install Python (3.12+) first.
    echo    Download from: https://python.org/
    echo    Make sure to check "Add Python to PATH" during installation.
    pause
    exit /b 1
)

echo ✅ Node.js version: 
node --version
echo ✅ Python version: 
python --version

REM Detect package manager
set PACKAGE_MANAGER=
bun --version >nul 2>&1
if not errorlevel 1 (
    set PACKAGE_MANAGER=bun
    echo ✅ Using Bun package manager
    goto :package_manager_found
)

yarn --version >nul 2>&1
if not errorlevel 1 (
    set PACKAGE_MANAGER=yarn
    echo ✅ Using Yarn package manager
    goto :package_manager_found
)

npm --version >nul 2>&1
if not errorlevel 1 (
    set PACKAGE_MANAGER=npm
    echo ✅ Using npm package manager
    goto :package_manager_found
)

echo ❌ No package manager found. Please install npm, yarn, or bun.
pause
exit /b 1

:package_manager_found
echo.
echo 🔧 Setting up Frontend...
cd frontend

if "%PACKAGE_MANAGER%"=="bun" (
    bun install
) else if "%PACKAGE_MANAGER%"=="yarn" (
    yarn install
) else (
    npm install
)

if errorlevel 1 (
    echo ❌ Frontend setup failed
    pause
    exit /b 1
)

echo ✅ Frontend dependencies installed

echo.
echo 🐍 Setting up Backend...
cd ..\backend

REM Create virtual environment
python -m venv env

if errorlevel 1 (
    echo ❌ Failed to create virtual environment
    pause
    exit /b 1
)

REM Activate virtual environment
call env\Scripts\activate.bat

REM Install dependencies
pip install -r requirements.txt

if errorlevel 1 (
    echo ❌ Backend setup failed
    pause
    exit /b 1
)

echo ✅ Backend dependencies installed

echo.
echo 🎉 Setup Complete!
echo.
echo To start the application:
echo 1. Start the backend server:
echo    cd backend
echo    env\Scripts\activate
echo    python main.py
echo.
echo 2. In a new terminal, start the frontend:
echo    cd frontend
if "%PACKAGE_MANAGER%"=="bun" (
    echo    bun run dev:bun
) else (
    echo    %PACKAGE_MANAGER% run dev
)
echo.
echo 3. Open http://localhost:5173 in your browser
echo.
echo 📖 For more information, see README.md
echo.
pause 