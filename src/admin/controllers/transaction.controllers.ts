import { Request, Response, NextFunction } from 'express';
import { catchAsync } from '@/utils/catchAsync';
import { AppError } from '@/utils/AppError';
import { Transaction, ITransaction } from '@/models/transaction.model';
import { Business } from '@/models/bussiness.model';
import { Log, LogType, LogSeverity } from '@/models/log.model';

// Get all transactions with filtering and pagination
export const getAllTransactions = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = req.query.search as string;
    const status = req.query.status as string;
    const type = req.query.type as string;
    const dateRange = req.query.dateRange as string;

    // Build query
    const query: any = {};

    if (search) {
      query.$or = [
        { orderNo: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }

    if (status && status !== 'all') {
      query.status = status;
    }

    if (type && type !== 'all') {
      query.type = type;
    }

    // Date range filter
    if (dateRange && dateRange !== 'all') {
      const now = new Date();
      const startDate = new Date();

      switch (dateRange) {
        case 'today':
          startDate.setHours(0, 0, 0, 0);
          break;
        case 'week':
          startDate.setDate(now.getDate() - 7);
          break;
        case 'month':
          startDate.setDate(now.getDate() - 30);
          break;
      }

      query.createdAt = {
        $gte: startDate,
        $lte: now,
      };
    }

    // Execute query with pagination
    const transactions = await Transaction.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('business', 'name')
      .populate('user', 'name email username phoneNumber');

    // Get total count for pagination
    const total = await Transaction.countDocuments(query);

    // Get transaction statistics
    const stats = await Transaction.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: '$amount' },
          successfulAmount: {
            $sum: {
              $cond: [{ $eq: ['$status', 'completed'] }, '$amount', 0],
            },
          },
          failedAmount: {
            $sum: {
              $cond: [{ $eq: ['$status', 'failed'] }, '$amount', 0],
            },
          },
          pendingAmount: {
            $sum: {
              $cond: [{ $eq: ['$status', 'pending'] }, '$amount', 0],
            },
          },
        },
      },
    ]);

    res.status(200).json({
      status: 'success',
      data: {
        transactions,
        stats: stats[0] || {
          totalAmount: 0,
          successfulAmount: 0,
          failedAmount: 0,
          pendingAmount: 0,
        },
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

// Get single transaction
export const getTransaction = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const transaction = await Transaction.findById(req.params.id)
      .populate('business', 'name')
      .populate('user', 'name email username phone');

    if (!transaction) {
      return next(new AppError('No transaction found with that ID', 404));
    }

    res.status(200).json({
      status: 'success',
      data: transaction,
    });
  }
);

// Update transaction status
export const updateTransactionStatus = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { status } = req.body;
    const transaction = await Transaction.findById(req.params.id);

    if (!transaction) {
      return next(new AppError('No transaction found with that ID', 404));
    }

    // Check if status transition is valid
    if (!isValidStatusTransition(transaction.status, status)) {
      return next(new AppError('Invalid status transition', 400));
    }

    transaction.status = status;
    await transaction.save();

    // Log the status change
    await Log.create({
      type: LogType.APPLICATION,
      severity: LogSeverity.INFO,
      message: `Transaction status updated to ${status}`,
      userId: transaction.user.toString(),
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      route: req.originalUrl,
      method: req.method,
      metadata: {
        transactionId: transaction._id,
        oldStatus: transaction.status,
        newStatus: status,
        updatedBy: req.user?._id,
      },
    });

    res.status(200).json({
      status: 'success',
      data: transaction,
    });
  }
);

// Get transaction statistics
export const getTransactionStats = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { period = '30days' } = req.query;
    const startDate = getStartDate(period as string);

    const stats = await Transaction.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
          },
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
          successfulCount: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] },
          },
          failedCount: {
            $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] },
          },
        },
      },
      {
        $sort: { _id: 1 },
      },
    ]);

    const typeDistribution = await Transaction.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
        },
      },
    ]);

    res.status(200).json({
      status: 'success',
      data: {
        dailyStats: stats,
        typeDistribution,
      },
    });
  }
);

// Get business transaction analytics
export const getBusinessTransactionAnalytics = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const businessId = req.params.id;
    const period = (req.query.period as string) || '30days';

    // Verify business exists
    const business = await Business.findById(businessId);
    if (!business) {
      return next(new AppError('Business not found', 404));
    }

    const startDate = getStartDate(period);

    // Get transaction trends (daily data for the last 30 days)
    const transactionTrends = await Transaction.aggregate([
      {
        $match: {
          business: business._id,
          createdAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
          },
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
          successfulCount: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] },
          },
          failedCount: {
            $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] },
          },
          pendingCount: {
            $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] },
          },
          cancelledCount: {
            $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] },
          },
          successfulAmount: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, '$amount', 0] },
          },
          failedAmount: {
            $sum: { $cond: [{ $eq: ['$status', 'failed'] }, '$amount', 0] },
          },
        },
      },
      {
        $sort: { _id: 1 },
      },
    ]);

    // Get transaction type distribution
    const typeDistribution = await Transaction.aggregate([
      {
        $match: {
          business: business._id,
          createdAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
          successfulCount: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] },
          },
          failedCount: {
            $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] },
          },
        },
      },
      {
        $sort: { count: -1 },
      },
    ]);

    // Get status distribution
    const statusDistribution = await Transaction.aggregate([
      {
        $match: {
          business: business._id,
          createdAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
        },
      },
      {
        $sort: { count: -1 },
      },
    ]);

    // Get monthly trends (last 6 months)
    const monthlyTrends = await Transaction.aggregate([
      {
        $match: {
          business: business._id,
          createdAt: { $gte: new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000) },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
          },
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
          successfulAmount: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, '$amount', 0] },
          },
        },
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1 },
      },
    ]);

    // Get success rate trends
    const successRateTrends = await Transaction.aggregate([
      {
        $match: {
          business: business._id,
          createdAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
          },
          totalCount: { $sum: 1 },
          successfulCount: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] },
          },
        },
      },
      {
        $addFields: {
          successRate: {
            $multiply: [{ $divide: ['$successfulCount', '$totalCount'] }, 100],
          },
        },
      },
      {
        $sort: { _id: 1 },
      },
    ]);

    // Get average transaction amount by type
    const avgAmountByType = await Transaction.aggregate([
      {
        $match: {
          business: business._id,
          createdAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: '$type',
          avgAmount: { $avg: '$amount' },
          minAmount: { $min: '$amount' },
          maxAmount: { $max: '$amount' },
          count: { $sum: 1 },
        },
      },
    ]);

    // Get recent transactions summary
    const recentTransactions = await Transaction.aggregate([
      {
        $match: {
          business: business._id,
          createdAt: { $gte: startDate },
        },
      },
      {
        $sort: { createdAt: -1 },
      },
      {
        $limit: 5,
      },
      {
        $project: {
          _id: 1,
          type: 1,
          amount: 1,
          status: 1,
          createdAt: 1,
          orderNo: 1,
        },
      },
    ]);

    // Calculate overall statistics
    const overallStats = await Transaction.aggregate([
      {
        $match: {
          business: business._id,
          createdAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: null,
          totalTransactions: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
          successfulTransactions: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] },
          },
          failedTransactions: {
            $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] },
          },
          pendingTransactions: {
            $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] },
          },
          successfulAmount: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, '$amount', 0] },
          },
          failedAmount: {
            $sum: { $cond: [{ $eq: ['$status', 'failed'] }, '$amount', 0] },
          },
          avgTransactionAmount: { $avg: '$amount' },
          minTransactionAmount: { $min: '$amount' },
          maxTransactionAmount: { $max: '$amount' },
        },
      },
    ]);

    const stats = overallStats[0] || {
      totalTransactions: 0,
      totalAmount: 0,
      successfulTransactions: 0,
      failedTransactions: 0,
      pendingTransactions: 0,
      successfulAmount: 0,
      failedAmount: 0,
      avgTransactionAmount: 0,
      minTransactionAmount: 0,
      maxTransactionAmount: 0,
    };

    // Calculate success rate
    const successRate =
      stats.totalTransactions > 0
        ? (stats.successfulTransactions / stats.totalTransactions) * 100
        : 0;

    res.status(200).json({
      status: 'success',
      data: {
        period,
        startDate,
        overallStats: {
          ...stats,
          successRate: Math.round(successRate * 100) / 100,
        },
        transactionTrends,
        typeDistribution,
        statusDistribution,
        monthlyTrends,
        successRateTrends,
        avgAmountByType,
        recentTransactions,
      },
    });
  }
);

// Helper functions
function isValidStatusTransition(currentStatus: string, newStatus: string): boolean {
  const validTransitions: { [key: string]: string[] } = {
    pending: ['completed', 'failed', 'cancelled'],
    completed: ['refunded'],
    failed: ['pending'],
    cancelled: ['pending'],
    refunded: [],
  };

  return validTransitions[currentStatus]?.includes(newStatus) || false;
}

function getStartDate(period: string): Date {
  const now = new Date();
  const startDate = new Date();

  switch (period) {
    case '7days':
      startDate.setDate(now.getDate() - 7);
      break;
    case '30days':
      startDate.setDate(now.getDate() - 30);
      break;
    case '90days':
      startDate.setDate(now.getDate() - 90);
      break;
    case '1year':
      startDate.setFullYear(now.getFullYear() - 1);
      break;
    default:
      startDate.setDate(now.getDate() - 30);
  }

  return startDate;
}
