#!/bin/bash

# Quick VPS Deployment Script
# Run this on your VPS after uploading the project

echo "🚀 Starting Video Analysis Tool Deployment..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm first."
    exit 1
fi

echo "✅ Node.js version: $(node --version)"
echo "✅ npm version: $(npm --version)"

# Install dependencies
echo ""
echo "📦 Installing dependencies..."
npm install

# Create required directories
echo ""
echo "📁 Creating required directories..."
mkdir -p data shared
chmod -R 755 data/ shared/

# Check for .env file
if [ ! -f .env ]; then
    echo ""
    echo "⚠️  .env file not found!"
    echo "Creating .env template..."
    echo "PORT=3001" > .env
    echo "GEMINI_API_KEY=your_actual_gemini_api_key_here" >> .env
    echo ""
    echo "❌ Please edit .env and add your GEMINI_API_KEY"
    echo "   Run: nano .env"
    exit 1
fi

# Check if GEMINI_API_KEY is set
if grep -q "your_actual_gemini_api_key_here" .env; then
    echo ""
    echo "⚠️  Please set your GEMINI_API_KEY in .env file"
    echo "   Run: nano .env"
    exit 1
fi

# Install PM2 if not installed
if ! command -v pm2 &> /dev/null; then
    echo ""
    echo "📦 Installing PM2..."
    npm install -g pm2
fi

# Stop existing instance if running
echo ""
echo "🛑 Stopping existing instance (if running)..."
pm2 stop video-analysis 2>/dev/null || true
pm2 delete video-analysis 2>/dev/null || true

# Start the server
echo ""
echo "🚀 Starting server with PM2..."
pm2 start server.js --name video-analysis

# Save PM2 configuration
pm2 save

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📊 Check server status:"
echo "   pm2 list"
echo ""
echo "📝 View logs:"
echo "   pm2 logs video-analysis"
echo ""
echo "🔄 Restart server:"
echo "   pm2 restart video-analysis"
echo ""
echo "🌐 Your server should be running on:"
echo "   http://your-vps-ip:3001"
echo ""
echo "⚠️  Don't forget to:"
echo "   1. Configure firewall (sudo ufw allow 3001/tcp)"
echo "   2. Setup nginx reverse proxy (see VPS_DEPLOYMENT.md)"
echo "   3. Test the application!"

