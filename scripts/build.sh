#!/bin/bash

echo "🚀 Starting build process..."

# Clean dist directory
echo "🧹 Cleaning dist directory..."
rm -rf dist/

# Compile TypeScript
echo "📦 Compiling TypeScript..."
npm run build

# Copy static assets
echo "📁 Copying static assets..."
if [ -d "src/templates" ]; then
    # Only copy logo.png since HTML templates are now embedded in TypeScript
    if [ -f "src/templates/logo.png" ]; then
        mkdir -p dist/templates
        cp src/templates/logo.png dist/templates/
        echo "✅ Logo copied"
    fi
fi

if [ -d "src/assets" ]; then
    cp -r src/assets dist/
    echo "✅ Assets copied"
fi

if [ -d "src/config" ]; then
    cp -r src/config dist/
    echo "✅ Config copied"
fi

# Copy any other static files
if [ -f "src/.env.example" ]; then
    cp src/.env.example dist/
    echo "✅ Environment example copied"
fi

# Verify critical files exist
echo "🔍 Verifying critical files..."
if [ ! -f "dist/server.js" ]; then
    echo "❌ Error: server.js not found in dist/"
    exit 1
fi

echo "✅ Build completed successfully!"
echo "📂 Dist directory contents:"
ls -la dist/ 