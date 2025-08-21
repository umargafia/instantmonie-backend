import { NextFunction, Request, Response } from 'express';
import { catchAsync } from '@/utils/catchAsync';
import { AppError } from '@/utils/AppError';
import { Admin, IAdmin } from '../modules/admin.model';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '@/config/env';
import { createSendToken } from '@/utils/createSendToken';

// Create new admin
export const createAdmin = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  const { firstName, lastName, email, password, passwordConfirm, role } = req.body;

  const requiredFields = ['firstName', 'lastName', 'email', 'password', 'passwordConfirm'];

  const missingFields = requiredFields.filter((field) => !req.body[field]);

  if (missingFields.length > 0) {
    return next(new AppError(`Missing required fields: ${missingFields.join(', ')}`, 400));
  }

  if (role && role !== 'super_admin' && role !== 'admin') {
    return next(new AppError('Invalid role', 400));
  }

  if (password !== passwordConfirm) {
    return next(new AppError('Passwords do not match', 400));
  }

  const emailExists = await Admin.findOne({ email });
  if (emailExists) {
    return next(new AppError('Email already exists', 400));
  }

  const admin = await Admin.create({
    firstName,
    lastName,
    email,
    password,
    role: role || 'admin',
  });

  // Remove password from output
  const adminResponse = admin.toObject();
  delete (adminResponse as any).password;

  res.status(201).json({
    status: 'success',
    data: adminResponse,
  });
});

// Admin login
export const login = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  const { email, password } = req.body;

  // Check if email and password exist
  if (!email || !password) {
    return next(new AppError('Please provide email and password', 400));
  }

  // Check if admin exists && password is correct
  const admin = await Admin.findOne({ email }).select('+password');

  if (!admin || !(await bcrypt.compare(password, admin.password))) {
    return next(new AppError('Incorrect email or password', 401));
  }

  if (!admin.isActive) {
    return next(new AppError('Your account has been deactivated. Please contact support.', 401));
  }

  // Update last login
  admin.lastLogin = new Date();
  await admin.save({ validateBeforeSave: false });

  // Create and send token
  createSendToken(admin as any, 200, res);
});

// Get current admin
export const getMe = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  const admin = await Admin.findById(req.user.id);

  if (!admin) {
    return next(new AppError('No admin found with that ID', 404));
  }

  res.status(200).json({
    status: 'success',
    data: admin,
  });
});

// Update admin profile
export const updateMe = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  // Create error if admin POSTs password data
  if (req.body.password || req.body.passwordConfirm) {
    return next(
      new AppError('This route is not for password updates. Please use /updateMyPassword.', 400)
    );
  }

  // Filter out unwanted fields names that are not allowed to be updated
  const filteredBody = {
    firstName: req.body.firstName,
    lastName: req.body.lastName,
    email: req.body.email,
  };

  // Update admin document
  const admin = await Admin.findByIdAndUpdate(req.user.id, filteredBody, {
    new: true,
    runValidators: true,
  });

  if (!admin) {
    return next(new AppError('No admin found with that ID', 404));
  }

  res.status(200).json({
    status: 'success',
    data: admin,
  });
});

// Update admin password
export const updatePassword = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    // Get admin from collection
    const admin = await Admin.findById(req.user.id).select('+password');

    if (!admin) {
      return next(new AppError('No admin found with that ID', 404));
    }

    // Check if POSTed current password is correct
    if (!(await bcrypt.compare(req.body.passwordCurrent, admin.password))) {
      return next(new AppError('Your current password is wrong.', 401));
    }

    // If so, update password
    admin.password = req.body.password;
    await admin.save();

    // Log admin in, send JWT
    createSendToken(admin as any, 200, res);
  }
);

// Get all admins
export const getAllAdmins = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  const admins = await Admin.find();

  res.status(200).json({
    status: 'success',
    results: admins.length,
    data: admins,
  });
});

// Get single admin
export const getAdmin = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  const admin = await Admin.findById(req.params.id);

  if (!admin) {
    return next(new AppError('No admin found with that ID', 404));
  }

  res.status(200).json({
    status: 'success',
    data: admin,
  });
});

// Update admin (by super admin)
export const updateAdmin = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  // Don't allow password updates on this route
  if (req.body.password) {
    return next(
      new AppError('This route is not for password updates. Please use /updatePassword.', 400)
    );
  }

  const admin = await Admin.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });

  if (!admin) {
    return next(new AppError('No admin found with that ID', 404));
  }

  res.status(200).json({
    status: 'success',
    data: admin,
  });
});

// Delete admin
export const deleteAdmin = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  const admin = await Admin.findByIdAndDelete(req.params.id);

  if (!admin) {
    return next(new AppError('No admin found with that ID', 404));
  }

  res.status(204).json({
    status: 'success',
    data: null,
  });
});

// Deactivate admin
export const deactivateAdmin = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const admin = await Admin.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      {
        new: true,
        runValidators: true,
      }
    );

    if (!admin) {
      return next(new AppError('No admin found with that ID', 404));
    }

    res.status(200).json({
      status: 'success',
      data: admin,
    });
  }
);

// Activate admin
export const activateAdmin = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  const admin = await Admin.findByIdAndUpdate(
    req.params.id,
    { isActive: true },
    {
      new: true,
      runValidators: true,
    }
  );

  if (!admin) {
    return next(new AppError('No admin found with that ID', 404));
  }

  res.status(200).json({
    status: 'success',
    data: admin,
  });
});

// Logout admin
export const logout = (req: Request, res: Response) => {
  res.cookie('jwt', 'loggedout', {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true,
  });
  res.status(200).json({ status: 'success' });
};
