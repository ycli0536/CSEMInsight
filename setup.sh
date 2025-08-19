#!/bin/bash

# CSEMInsight Cross-Platform Setup Script (macOS/Linux)
echo "🌊 Setting up CSEMInsight - Marine CSEM Data Visualization Toolkit"
echo "=================================================================="

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js (v22+) first."
    echo "   Download from: https://nodejs.org/"
    exit 1
fi

# Check if Python is installed
if ! command -v python &> /dev/null && ! command -v python3 &> /dev/null; then
    echo "❌ Python is not installed. Please install Python (3.12+) first."
    echo "   Download from: https://python.org/"
    exit 1
fi

# Use python3 if available, otherwise python
PYTHON_CMD="python"
if command -v python3 &> /dev/null; then
    PYTHON_CMD="python3"
fi

echo "✅ Node.js version: $(node --version)"
echo "✅ Python version: $($PYTHON_CMD --version)"

# Detect package manager
PACKAGE_MANAGER=""
if command -v bun &> /dev/null; then
    PACKAGE_MANAGER="bun"
    echo "✅ Using Bun package manager"
elif command -v yarn &> /dev/null; then
    PACKAGE_MANAGER="yarn"
    echo "✅ Using Yarn package manager"
elif command -v npm &> /dev/null; then
    PACKAGE_MANAGER="npm"
    echo "✅ Using npm package manager"
else
    echo "❌ No package manager found. Please install npm, yarn, or bun."
    exit 1
fi

echo ""
echo "🔧 Setting up Frontend..."
cd frontend

if [ "$PACKAGE_MANAGER" = "bun" ]; then
    bun install
elif [ "$PACKAGE_MANAGER" = "yarn" ]; then
    yarn install
else
    npm install
fi

echo "✅ Frontend dependencies installed"

echo ""
echo "🐍 Setting up Backend..."
cd ../backend

# Create virtual environment
$PYTHON_CMD -m venv env

# Activate virtual environment
source env/bin/activate

# Install dependencies
pip install -r requirements.txt

echo "✅ Backend dependencies installed"

echo ""
echo "🎉 Setup Complete!"
echo ""
echo "To start the application:"
echo "1. Start the backend server:"
echo "   cd backend"
echo "   source env/bin/activate"
echo "   python main.py"
echo ""
echo "2. In a new terminal, start the frontend:"
echo "   cd frontend"
if [ "$PACKAGE_MANAGER" = "bun" ]; then
    echo "   bun run dev:bun"
else
    echo "   $PACKAGE_MANAGER run dev"
fi
echo ""
echo "3. Open http://localhost:5173 in your browser"
echo ""
echo "📖 For more information, see README.md" 