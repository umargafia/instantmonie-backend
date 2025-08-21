#!/bin/bash

# Check if MongoDB is running
if ! pgrep -x "mongod" > /dev/null; then
    echo "Starting MongoDB..."
    
    # Try to start MongoDB with reduced logging
    if command -v mongod >/dev/null 2>&1; then
        mongod --dbpath ./data/db --quiet --logpath /dev/null &
        echo "✅ MongoDB started successfully"
    else
        echo "❌ Error: MongoDB is not installed. Please install MongoDB first."
        exit 1
    fi
else
    echo "✅ MongoDB is already running"
fi 