#!/bin/bash

# Check if git is installed
if ! command -v git &> /dev/null; then
    echo "Git is not installed. Please install git first."
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "npm is not installed. Please install Node.js and npm first."
    exit 1
fi

# Create temporary directory
TEMP_DIR=$(mktemp -d)
cd "$TEMP_DIR"

# Clone repository
git clone https://github.com/pendialek/mcp-replicate.git
cd mcp-replicate

# Install dependencies and build
npm install
npm run build

# Create global symlink with sudo
npm link

echo "Installation complete. You can now run 'mcp-replicate' with your REPLICATE_API_TOKEN."
echo "Example: REPLICATE_API_TOKEN=your_token_here mcp-replicate"