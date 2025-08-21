import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/AppError';
import mongoose from 'mongoose';

interface MongoError extends Error {
  code?: number;
}

interface ErrorResponse {
  status: string;
  message: string;
  error?: {
    statusCode?: number;
    stack?: string;
    name?: string;
  };
}

const isProduction = process.env.NODE_ENV === 'production';

export const errorHandler = (
  err: Error | AppError | MongoError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Log error details in both environments
  console.error('Error details:', {
    name: err.name,
    message: err.message,
    stack: err.stack,
    code: (err as MongoError).code,
  });

  let statusCode = 500;
  let errorResponse: ErrorResponse = {
    status: 'error',
    message: isProduction ? 'Something went wrong!' : err.message,
  };

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    errorResponse = {
      status: err.status,
      message: err.message, // Always show AppError messages
      error: {
        statusCode: err.statusCode,
      },
    };
  } else if (err instanceof mongoose.Error.ValidationError) {
    statusCode = 400;
    const messages = Object.values(err.errors).map((error) => error.message);
    errorResponse.message = messages.join('. '); // Always show validation messages
  } else if (err instanceof mongoose.Error.CastError) {
    statusCode = 400;
    errorResponse.message = `Invalid ${err.path}: ${err.value}`; // Always show cast error messages
  } else if ((err as MongoError).code === 11000) {
    statusCode = 400;
    errorResponse.message = 'Duplicate field value entered'; // Always show duplicate key messages
  } else {
    // For unknown errors
    if (!isProduction) {
      errorResponse.error = {
        stack: err.stack,
      };
    }
  }

  // Add error details in development
  if (!isProduction) {
    errorResponse.error = {
      ...errorResponse.error,
      name: err.name,
      stack: err.stack,
    };
  }

  res.status(statusCode).json(errorResponse);
};
