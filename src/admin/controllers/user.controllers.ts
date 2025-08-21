import { Request, Response, NextFunction } from 'express';
import { catchAsync } from '@/utils/catchAsync';
import { AppError } from '@/utils/AppError';
import { User } from '@/models/user.model';
import { Log, LogType, LogSeverity, SecurityAction } from '@/models/log.model';
import crypto from 'crypto';

// Get all users with filtering and pagination
export const getAllUsers = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const search = req.query.search as string;
  const status = req.query.status as string;
  const role = req.query.role as string;

  // Build query
  const query: any = {};

  if (search) {
    query.$or = [
      { firstName: { $regex: search, $options: 'i' } },
      { lastName: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { phoneNumber: { $regex: search, $options: 'i' } },
    ];
  }

  if (status && status !== 'all') {
    query.status = status;
  }

  if (role && role !== 'all') {
    query.role = role;
  }

  // Execute query with pagination
  const users = await User.find(query)
    .select('-password -passwordChangedAt -passwordResetToken -passwordResetExpires')
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit);

  // Get total count for pagination
  const total = await User.countDocuments(query);

  res.status(200).json({
    status: 'success',
    data: {
      users,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    },
  });
});

// Get single user
export const getUser = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  const user = await User.findById(req.params.id).select(
    '-password -passwordChangedAt -passwordResetToken -passwordResetExpires'
  );

  if (!user) {
    return next(new AppError('No user found with that ID', 404));
  }

  res.status(200).json({
    status: 'success',
    data: user,
  });
});

// Create new user
export const createUser = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  const { firstName, lastName, email, phoneNumber, role, password } = req.body;

  const user = await User.create({
    firstName,
    lastName,
    email,
    phoneNumber,
    role,
    password,
  });

  // Remove sensitive data
  user.password = '';
  user.passwordChangedAt = undefined;
  user.passwordResetToken = '';
  user.passwordResetExpires = undefined;

  res.status(201).json({
    status: 'success',
    data: user,
  });
});

// Update user
export const updateUser = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  const { firstName, lastName, email, phoneNumber, role, status } = req.body || {};

  const updateData: any = {};
  if (firstName !== undefined) updateData.firstName = firstName;
  if (lastName !== undefined) updateData.lastName = lastName;
  if (email !== undefined) updateData.email = email;
  if (phoneNumber !== undefined) updateData.phoneNumber = phoneNumber;
  if (role !== undefined) updateData.role = role;
  if (status !== undefined) updateData.status = status;

  const user = await User.findByIdAndUpdate(req.params.id, updateData, {
    new: true,
    runValidators: true,
  }).select('-password -passwordChangedAt -passwordResetToken -passwordResetExpires');

  if (!user) {
    return next(new AppError('No user found with that ID', 404));
  }

  res.status(200).json({
    status: 'success',
    data: user,
  });
});

// Delete user
export const deleteUser = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  const user = await User.findByIdAndDelete(req.params.id);

  if (!user) {
    return next(new AppError('No user found with that ID', 404));
  }

  res.status(204).json({
    status: 'success',
    data: null,
  });
});

// Update user status
export const updateUserStatus = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { status } = req.body;

    if (!status) {
      return next(new AppError('Status is required', 400));
    }

    if (status !== 'active' && status !== 'inactive' && status !== 'suspended') {
      return next(new AppError('Invalid status', 400));
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { status },
      {
        new: true,
        runValidators: true,
      }
    ).select('-password -passwordChangedAt -passwordResetToken -passwordResetExpires');

    if (!user) {
      return next(new AppError('No user found with that ID', 404));
    }

    res.status(200).json({
      status: 'success',
      data: user,
    });
  }
);

// Get user statistics
export const getUserStats = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  const stats = await User.aggregate([
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
      },
    },
  ]);

  const totalUsers = await User.countDocuments();
  const activeUsers = await User.countDocuments({ status: 'active' });
  const inactiveUsers = await User.countDocuments({ status: 'inactive' });
  const suspendedUsers = await User.countDocuments({ status: 'suspended' });

  res.status(200).json({
    status: 'success',
    data: {
      total: totalUsers,
      active: activeUsers,
      inactive: inactiveUsers,
      suspended: suspendedUsers,
      byStatus: stats,
    },
  });
});

// Get user activity logs
export const getUserActivity = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.params.id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const type = req.query.type as string;
    const severity = req.query.severity as string;
    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;

    // Build query
    const query: any = { userId };

    if (type) {
      query.type = type;
    }

    if (severity) {
      query.severity = severity;
    }

    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = startDate;
      if (endDate) query.timestamp.$lte = endDate;
    }

    // Execute query with pagination
    const logs = await Log.find(query)
      .sort({ timestamp: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    // Get total count for pagination
    const total = await Log.countDocuments(query);

    // Get activity summary
    const activitySummary = await Log.aggregate([
      { $match: { userId } },
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 },
          lastActivity: { $max: '$timestamp' },
        },
      },
    ]);

    res.status(200).json({
      status: 'success',
      data: {
        logs,
        summary: activitySummary,
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
        },
      },
    });
  }
);

// Reset user password
export const resetUserPassword = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { password } = req.body;
    const userId = req.params.id;

    // Generate random password if not provided
    const newPassword = password || crypto.randomBytes(8).toString('hex');

    const user = await User.findById(userId);
    if (!user) {
      return next(new AppError('No user found with that ID', 404));
    }

    // Update password
    user.password = newPassword;
    user.passwordChangedAt = new Date();
    await user.save();

    // Log the password reset
    await Log.create({
      type: LogType.SECURITY,
      severity: LogSeverity.INFO,
      message: 'Password reset by admin',
      action: SecurityAction.PASSWORD_RESET,
      userId: user._id.toString(),
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      route: req.originalUrl,
      method: req.method,
      metadata: {
        resetBy: req.user?._id,
        resetMethod: 'admin',
      },
    });

    res.status(200).json({
      status: 'success',
      data: {
        message: 'Password reset successful',
        newPassword: !password ? newPassword : undefined, // Only return generated password if none was provided
      },
    });
  }
);

// Get user security logs
export const getUserSecurityLogs = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.params.id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;

    const logs = await Log.find({
      userId,
      type: LogType.SECURITY,
    })
      .sort({ timestamp: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const total = await Log.countDocuments({
      userId,
      type: LogType.SECURITY,
    });

    // Get security summary
    const securitySummary = await Log.aggregate([
      {
        $match: {
          userId,
          type: LogType.SECURITY,
        },
      },
      {
        $group: {
          _id: '$action',
          count: { $sum: 1 },
          lastOccurrence: { $max: '$timestamp' },
        },
      },
    ]);

    res.status(200).json({
      status: 'success',
      data: {
        logs,
        summary: securitySummary,
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
        },
      },
    });
  }
);

export const toggleUserStatus = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params;

    const user = await User.findById(id);

    if (!user) {
      return next(new AppError('No user found with that ID', 404));
    }

    user.disabled = !user.disabled;

    await user.save({ validateBeforeSave: false });

    await Log.create({
      type: LogType.SECURITY,
      severity: LogSeverity.INFO,
      message: 'User status toggled by admin',
      action: SecurityAction.ACCOUNT_DISABLED,
      userId: user._id.toString(),
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      route: req.originalUrl,
      method: req.method,
      metadata: {
        disabled: user.disabled,
      },
    });

    res.status(200).json({
      status: 'success',
      data: user,
    });
  }
);
