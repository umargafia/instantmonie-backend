import { Request, Response } from 'express';
import { catchAsync } from '@/utils/catchAsync';
import { AppError } from '@/utils/AppError';
import { Business } from '@/models/bussiness.model';
import { Transaction } from '@/models/transaction.model';
import { Log, LogType, LogSeverity, SecurityAction } from '@/models/log.model';

// Get all businesses with filtering and pagination
export const getAllBusinesses = catchAsync(async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const skip = (page - 1) * limit;

  // Build query based on filters
  const query: any = {};

  // Search by name, email, or legal business name
  if (req.query.search) {
    query.$or = [
      { name: { $regex: req.query.search, $options: 'i' } },
      { 'compliance.email': { $regex: req.query.search, $options: 'i' } },
      { 'compliance.legalBusinessName': { $regex: req.query.search, $options: 'i' } },
    ];
  }

  // Filter by business type
  if (req.query.businessType) {
    query['compliance.businessType'] = req.query.businessType;
  }

  // Filter by verification status
  if (req.query.verificationStatus) {
    query['compliance.verificationStatus'] = req.query.verificationStatus;
  }

  // Filter by balance range
  if (req.query.minBalance || req.query.maxBalance) {
    query.balance = {};
    if (req.query.minBalance) {
      query.balance.$gte = parseFloat(req.query.minBalance as string);
    }
    if (req.query.maxBalance) {
      query.balance.$lte = parseFloat(req.query.maxBalance as string);
    }
  }

  // Filter by date range
  if (req.query.startDate && req.query.endDate) {
    query.createdAt = {
      $gte: new Date(req.query.startDate as string),
      $lte: new Date(req.query.endDate as string),
    };
  }

  // Get total count for pagination
  const total = await Business.countDocuments(query);

  // Get businesses with pagination
  const businesses = await Business.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .select('-__v');

  // Get business statistics
  const stats = await Business.aggregate([
    {
      $group: {
        _id: null,
        totalBusinesses: { $sum: 1 },
        totalBalance: { $sum: '$balance' },
        avgBalance: { $avg: '$balance' },
        verifiedBusinesses: {
          $sum: {
            $cond: [{ $eq: ['$compliance.verificationStatus', 'completed'] }, 1, 0],
          },
        },
        pendingBusinesses: {
          $sum: {
            $cond: [{ $eq: ['$compliance.verificationStatus', 'in_progress'] }, 1, 0],
          },
        },
        rejectedBusinesses: {
          $sum: {
            $cond: [{ $eq: ['$compliance.verificationStatus', 'rejected'] }, 1, 0],
          },
        },
      },
    },
  ]);

  res.status(200).json({
    status: 'success',
    data: {
      businesses,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
      stats: stats[0] || {
        totalBusinesses: 0,
        totalBalance: 0,
        avgBalance: 0,
        verifiedBusinesses: 0,
        pendingBusinesses: 0,
        rejectedBusinesses: 0,
      },
    },
  });
});

// Get a single business by ID
export const getBusiness = catchAsync(async (req: Request, res: Response) => {
  const business = await Business.findById(req.params.id).select('-__v');

  if (!business) {
    throw new AppError('Business not found', 404);
  }

  res.status(200).json({
    status: 'success',
    data: business,
  });
});

// Update business status
export const updateBusinessStatus = catchAsync(async (req: Request, res: Response) => {
  const { status } = req.body;

  const validStatuses = ['active', 'suspended', 'blocked'];
  if (!validStatuses.includes(status)) {
    throw new AppError('Invalid status', 400);
  }

  const business = await Business.findById(req.params.id);
  if (!business) {
    throw new AppError('Business not found', 404);
  }

  business.status = status;
  business.updatedAt = new Date();
  await business.save();

  // Log the action
  await Log.create({
    type: LogType.SECURITY,
    severity: LogSeverity.INFO,
    action: SecurityAction.BUSINESS_STATUS_UPDATE,
    message: `Business status updated to ${status}`,
    metadata: {
      businessId: business._id,
      status,
    },
  });

  res.status(200).json({
    status: 'success',
    message: 'Business status updated successfully',
    data: business,
  });
});

// Get business statistics
export const getBusinessStats = catchAsync(async (req: Request, res: Response) => {
  const period = (req.query.period as string) || 'all';
  const startDate = getStartDate(period);

  const matchStage = startDate ? { createdAt: { $gte: startDate } } : {};

  const stats = await Business.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        totalBusinesses: { $sum: 1 },
        totalBalance: { $sum: '$balance' },
        avgBalance: { $avg: '$balance' },
        verifiedBusinesses: {
          $sum: {
            $cond: [{ $eq: ['$compliance.verificationStatus', 'completed'] }, 1, 0],
          },
        },
        pendingBusinesses: {
          $sum: {
            $cond: [{ $eq: ['$compliance.verificationStatus', 'in_progress'] }, 1, 0],
          },
        },
        rejectedBusinesses: {
          $sum: {
            $cond: [{ $eq: ['$compliance.verificationStatus', 'rejected'] }, 1, 0],
          },
        },
      },
    },
  ]);

  // Get business type distribution
  const typeDistribution = await Business.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: '$compliance.businessType',
        count: { $sum: 1 },
      },
    },
  ]);

  res.status(200).json({
    status: 'success',
    data: {
      stats: stats[0] || {
        totalBusinesses: 0,
        totalBalance: 0,
        avgBalance: 0,
        verifiedBusinesses: 0,
        pendingBusinesses: 0,
        rejectedBusinesses: 0,
      },
      typeDistribution,
    },
  });
});

// Get business transactions
export const getBusinessTransactions = catchAsync(async (req: Request, res: Response) => {
  const businessId = req.params.id;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const skip = (page - 1) * limit;

  // Verify business exists
  const business = await Business.findById(businessId);
  if (!business) {
    throw new AppError('Business not found', 404);
  }

  // Build query
  const query: any = { business: businessId };

  // Filter by status
  if (req.query.status && req.query.status !== 'all') {
    query.status = req.query.status;
  }

  // Filter by type
  if (req.query.type && req.query.type !== 'all') {
    query.type = req.query.type;
  }

  // Date range filter
  if (req.query.startDate && req.query.endDate) {
    query.createdAt = {
      $gte: new Date(req.query.startDate as string),
      $lte: new Date(req.query.endDate as string),
    };
  }

  // Get transactions with pagination
  const transactions = await Transaction.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate('user', 'name email');

  // Get total count
  const total = await Transaction.countDocuments(query);

  // Get transaction statistics
  const stats = await Transaction.aggregate([
    { $match: { business: business._id } },
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
        totalCount: { $sum: 1 },
        successfulCount: {
          $sum: {
            $cond: [{ $eq: ['$status', 'completed'] }, 1, 0],
          },
        },
        failedCount: {
          $sum: {
            $cond: [{ $eq: ['$status', 'failed'] }, 1, 0],
          },
        },
      },
    },
  ]);

  res.status(200).json({
    status: 'success',
    data: {
      transactions,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
      stats: stats[0] || {
        totalAmount: 0,
        successfulAmount: 0,
        failedAmount: 0,
        totalCount: 0,
        successfulCount: 0,
        failedCount: 0,
      },
    },
  });
});

// Get business activity logs
export const getBusinessActivity = catchAsync(async (req: Request, res: Response) => {
  const businessId = req.params.id;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const skip = (page - 1) * limit;

  // Verify business exists
  const business = await Business.findById(businessId);
  if (!business) {
    throw new AppError('Business not found', 404);
  }

  // Build query
  const query: any = {
    $or: [{ 'metadata.businessId': businessId }, { 'metadata.business': businessId }],
  };

  // Filter by type
  if (req.query.type) {
    query.type = req.query.type;
  }

  // Filter by severity
  if (req.query.severity) {
    query.severity = req.query.severity;
  }

  // Date range filter
  if (req.query.startDate && req.query.endDate) {
    query.timestamp = {
      $gte: new Date(req.query.startDate as string),
      $lte: new Date(req.query.endDate as string),
    };
  }

  // Get logs with pagination
  const logs = await Log.find(query).sort({ timestamp: -1 }).skip(skip).limit(limit);

  // Get total count
  const total = await Log.countDocuments(query);

  // Get activity summary
  const activitySummary = await Log.aggregate([
    { $match: query },
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
});

// Get business analytics
export const getBusinessAnalytics = catchAsync(async (req: Request, res: Response) => {
  const businessId = req.params.id;
  const period = (req.query.period as string) || '30days';

  // Verify business exists
  const business = await Business.findById(businessId);
  if (!business) {
    throw new AppError('Business not found', 404);
  }

  const startDate = getStartDate(period);

  // Get transaction trends
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
      },
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
  ]);

  res.status(200).json({
    status: 'success',
    data: {
      transactionTrends,
      typeDistribution,
      statusDistribution,
    },
  });
});

// Helper function to get start date based on period
const getStartDate = (period: string): Date | null => {
  const now = new Date();
  switch (period) {
    case 'today':
      return new Date(now.setHours(0, 0, 0, 0));
    case 'week':
      return new Date(now.setDate(now.getDate() - 7));
    case 'month':
      return new Date(now.setMonth(now.getMonth() - 1));
    case 'year':
      return new Date(now.setFullYear(now.getFullYear() - 1));
    default:
      return null;
  }
};

export const updateBusinessCharges = catchAsync(async (req: Request, res: Response) => {
  const { charges } = req.body;
  const business = await Business.findById(req.params.id);
  if (!business) {
    throw new AppError('Business not found', 404);
  }
  business.charges = charges;
  await business.save();
  res.status(200).json({
    status: 'success',
    message: 'Business charges updated successfully',
    data: business,
  });
});
