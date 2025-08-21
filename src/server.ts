import './register';
import mongoose from 'mongoose';
import { env } from './config/env';
import app from './app';

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.log('❌ UNCAUGHT EXCEPTION! Shutting down...');
  console.log(err.name, err.message);
  process.exit(1);
});

// Connect to MongoDB with reduced logging
mongoose
  .connect(env.DATABASE_URL)
  .then(() => {
    console.log('✅ Database connected successfully');
  })
  .catch((err) => {
    console.error('❌ Database connection error:', err.message);
    process.exit(1);
  });

// Start server
const port = env.PORT || 3000;
const server = app.listen(port, () => {
  console.log(`🚀 Server running on port ${port} in ${env.NODE_ENV} mode`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.log('❌ UNHANDLED REJECTION! Shutting down...');
  console.log(err);
  server.close(() => {
    process.exit(1);
  });
});
