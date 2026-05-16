#!/bin/bash

# Option Trading Terminal - Automated Setup & Start Script
# Exit immediately if a command exits with a non-zero status
set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Set working directory to the script's location
cd "$(dirname "$0")"
PROJECT_ROOT=$(pwd)

echo -e "${BLUE}===============================================${NC}"
echo -e "${BLUE}   Option Trading Terminal - Setup & Start     ${NC}"
echo -e "${BLUE}===============================================${NC}"

# 0. Check Prerequisites
if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js is not installed.${NC}"
    exit 1
fi

NODE_MAJOR=$(node -v | cut -d 'v' -f 2 | cut -d '.' -f 1)
if [ "$NODE_MAJOR" -lt 20 ]; then
    echo -e "${RED}Error: Node.js version 20 or higher is required. Current: $(node -v)${NC}"
    exit 1
fi

# 1. Setup
echo -e "\n${GREEN}[1/2] Installing dependencies...${NC}"
npm install

# 2. Start Application
echo -e "\n${GREEN}[2/2] Starting Development Server...${NC}"
echo -e "${BLUE}Terminal: http://localhost:3000${NC}"
echo -e "${BLUE}Press Ctrl+C to stop${NC}"

npm run dev
