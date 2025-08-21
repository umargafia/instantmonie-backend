import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { env } from '../config/env';
import { User } from '../models/user.model';
import { AuthService } from '../services/authService';

let mongoServer: MongoMemoryServer | null = null;

export const setupTestDB = () => {
  beforeAll(async () => {
    try {
      // Create an in-memory MongoDB instance
      mongoServer = await MongoMemoryServer.create({
        instance: {
          dbName: 'jest',
        },
      });
      const mongoUri = mongoServer.getUri();

      // Connect to the in-memory database
      await mongoose.connect(mongoUri);
    } catch (error) {
      console.error('Error setting up test database:', error);
      throw error;
    }
  }, 60000); // Increase timeout to 60 seconds

  afterAll(async () => {
    try {
      await mongoose.disconnect();
      if (mongoServer) {
        await mongoServer.stop();
      }
    } catch (error) {
      console.error('Error cleaning up test database:', error);
    }
  });

  beforeEach(async () => {
    try {
      // Clear all collections before each test
      if (!mongoose.connection.db) {
        throw new Error('Database connection not established');
      }

      const collections = await mongoose.connection.db.collections();
      for (const collection of collections) {
        await collection.deleteMany({});
      }
    } catch (error) {
      console.error('Error clearing test collections:', error);
      throw error;
    }
  });
};

// Helper function to create a test user
export const createTestUser = async (role: 'user' | 'admin' = 'user') => {
  const userData = {
    name: 'Test User',
    email: 'test@example.com',
    password: 'password123',
    passwordConfirm: 'password123',
    username: 'testuser',
    phone: '+1234567890',
    role,
  };

  return await User.create(userData);
};

// Helper function to get auth token
export const getAuthToken = async (user: any) => {
  const token = AuthService.signToken(user._id.toString());
  return `Bearer ${token}`;
};
