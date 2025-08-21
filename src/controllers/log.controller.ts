import { Request, Response, NextFunction } from 'express';
import { catchAsync } from '../utils/catchAsync';
import { AppError } from '../utils/AppError';
import { Log, LogType, LogSeverity, SecurityAction } from '../models/log.model';

/**
 * Get logs with filtering and pagination
 * Only accessible by admins
 */
export const getLogs = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  const {
    type,
    severity,
    action,
    userId,
    startDate,
    endDate,
    page = 1,
    limit = 20,
    sort = '-timestamp',
  } = req.query;

  // Build filter object
  const filter: any = {};

  // Add type filter
  if (type) {
    filter.type = type;
  }

  // Add severity filter
  if (severity) {
    filter.severity = severity;
  }

  // Add action filter
  if (action) {
    filter.action = action;
  }

  // Add userId filter
  if (userId) {
    filter.userId = userId;
  }

  // Add date range filter
  if (startDate || endDate) {
    filter.timestamp = {};

    if (startDate) {
      filter.timestamp.$gte = new Date(startDate as string);
    }

    if (endDate) {
      filter.timestamp.$lte = new Date(endDate as string);
    }
  }

  // Calculate pagination
  const pageNum = parseInt(page as string, 10);
  const limitNum = parseInt(limit as string, 10);
  const skip = (pageNum - 1) * limitNum;

  // Execute query with pagination
  const logs = await Log.find(filter)
    .sort(sort as string)
    .skip(skip)
    .limit(limitNum);

  // Get total count for pagination
  const totalCount = await Log.countDocuments(filter);

  // Send response
  res.status(200).json({
    status: 'success',
    results: logs.length,
    totalCount,
    totalPages: Math.ceil(totalCount / limitNum),
    currentPage: pageNum,
    data: {
      logs,
    },
  });
});

/**
 * Get log types, severity levels, and actions for filters
 */
export const getLogMetadata = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    res.status(200).json({
      status: 'success',
      data: {
        types: Object.values(LogType),
        severityLevels: Object.values(LogSeverity),
        actions: Object.values(SecurityAction),
      },
    });
  }
);

/**
 * Get security logs for a specific user
 */
export const getUserSecurityLogs = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.params.userId;
    const { page = 1, limit = 20 } = req.query;

    // Calculate pagination
    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skip = (pageNum - 1) * limitNum;

    // Find security logs for the user
    const logs = await Log.find({
      type: LogType.SECURITY,
      userId,
    })
      .sort('-timestamp')
      .skip(skip)
      .limit(limitNum);

    // Get total count for pagination
    const totalCount = await Log.countDocuments({
      type: LogType.SECURITY,
      userId,
    });

    // Send response
    res.status(200).json({
      status: 'success',
      results: logs.length,
      totalCount,
      totalPages: Math.ceil(totalCount / limitNum),
      currentPage: pageNum,
      data: {
        logs,
      },
    });
  }
);

/**
 * Clear logs (admin only)
 */
export const clearLogs = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  const { type, olderThan } = req.body;

  if (!type) {
    return next(new AppError('Log type is required', 400));
  }

  const filter: any = { type };

  // Add date filter if provided
  if (olderThan) {
    filter.timestamp = { $lt: new Date(olderThan) };
  }

  // Delete logs
  const result = await Log.deleteMany(filter);

  res.status(200).json({
    status: 'success',
    message: `${result.deletedCount} logs deleted`,
  });
});
