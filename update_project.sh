#!/bin/bash

echo "Pulling latest changes from Git..."
git pull

echo "Installing dependencies..."
npm i

echo "Building project..."
npm run build

echo "Restarting PM2 process..."
pm2 restart payment

echo "Update completed!"
