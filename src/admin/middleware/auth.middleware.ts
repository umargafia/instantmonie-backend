import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { catchAsync } from '@/utils/catchAsync';
import { AppError } from '@/utils/AppError';
import { env } from '@/config/env';
import { Admin, IAdmin } from '@/admin/modules/admin.model';
import { Document, Types } from 'mongoose';

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

interface JwtPayload {
  id: string;
  iat?: number;
}

export const protect = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  // 1) Getting token and check if it exists
  let token;
  if (req.headers.authorization?.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies.jwt) {
    token = req.cookies.jwt;
  }

  if (!token) {
    return next(new AppError('You are not logged in! Please log in to get access.', 401));
  }

  // 2) Verification token
  const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;

  // 3) Check if admin still exists
  const currentAdmin = await Admin.findById(decoded.id);
  if (!currentAdmin) {
    return next(new AppError('The admin belonging to this token no longer exists.', 401));
  }

  // 4) Check if admin changed password after the token was issued
  if (currentAdmin.passwordChangedAt && decoded.iat) {
    const changedTimestamp = currentAdmin.passwordChangedAt.getTime() / 1000;
    if (decoded.iat < changedTimestamp) {
      return next(new AppError('Admin recently changed password! Please log in again.', 401));
    }
  }

  // Grant access to protected route
  req.user = currentAdmin;
  next();
});

export const restrictTo = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError('You are not logged in! Please log in to get access.', 401));
    }

    if (!roles.includes(req.user.role)) {
      return next(new AppError('You do not have permission to perform this action', 403));
    }

    next();
  };
};
