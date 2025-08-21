import { Request, Response, NextFunction } from 'express';
import { catchAsync } from '@/utils/catchAsync';
import { Transaction } from '@/models/transaction.model';
import { Business, IBusiness } from '@/models/bussiness.model';
import { User } from '@/models/user.model';
import { Admin } from '@/admin/modules/admin.model';

// Get recent transactions
export const getRecentTransactions = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const transactions = await Transaction.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .populate<{ business: IBusiness }>('business', 'name');

    const formattedTransactions = transactions.map((transaction) => ({
      _id: transaction._id,
      orderNo: transaction.orderNo,
      amount: transaction.amount,
      type: transaction.type,
      status: transaction.status,
      businessName: transaction.business.name,
      createdAt: transaction.createdAt,
    }));

    res.status(200).json({
      status: 'success',
      data: formattedTransactions,
    });
  }
);

// Get recent KYC applications
export const getRecentKyc = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  const kycApplications = await Business.find({
    'compliance.verificationStatus': { $in: ['in_progress', 'not_submitted'] },
  })
    .sort({ 'compliance.kyc.lastUpdated': -1 })
    .limit(10)
    .select('name compliance.verificationStatus compliance.kyc.lastUpdated');

  const formattedKyc = kycApplications.map((business) => ({
    _id: business._id,
    businessName: business.name,
    status: business.compliance.verificationStatus,
    submittedAt: business.compliance.kyc.lastUpdated,
  }));

  res.status(200).json({
    status: 'success',
    data: formattedKyc,
  });
});

// Get transaction trends
export const getTransactionTrends = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { period = '6months' } = req.query;
    const months = getMonthsForPeriod(period as string);

    const transactions = await Transaction.aggregate([
      {
        $match: {
          createdAt: {
            $gte: months[0],
            $lte: new Date(),
          },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
          },
          count: { $sum: 1 },
        },
      },
      {
        $sort: {
          '_id.year': 1,
          '_id.month': 1,
        },
      },
    ]);

    const labels = months.map((date) => date.toLocaleDateString('en-US', { month: 'short' }));

    const data = months.map((date) => {
      const monthData = transactions.find(
        (t) => t._id.year === date.getFullYear() && t._id.month === date.getMonth() + 1
      );
      return monthData ? monthData.count : 0;
    });

    res.status(200).json({
      status: 'success',
      data: {
        labels,
        datasets: [
          {
            label: 'Transactions',
            data,
            borderColor: 'rgb(79, 70, 229)',
            backgroundColor: 'rgba(79, 70, 229, 0.1)',
            fill: true,
            tension: 0.4,
          },
        ],
      },
    });
  }
);

// Get revenue distribution
export const getRevenueDistribution = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { dateRange } = req.query;
    const dateFilter = getDateFilter(dateRange as string);

    const distribution = await Transaction.aggregate([
      { $match: { ...dateFilter, status: 'completed' } },
      {
        $group: {
          _id: '$type',
          total: { $sum: '$amount' },
        },
      },
    ]);

    const labels = ['payment', 'refund', 'transfer', 'withdrawal'];
    const data = labels.map((label) => {
      const found = distribution.find((d) => d._id === label);
      return found ? found.total : 0;
    });

    res.status(200).json({
      status: 'success',
      data: {
        labels,
        datasets: [
          {
            data,
            backgroundColor: [
              'rgba(34, 197, 94, 0.8)',
              'rgba(239, 68, 68, 0.8)',
              'rgba(59, 130, 246, 0.8)',
              'rgba(245, 158, 11, 0.8)',
            ],
            borderColor: [
              'rgb(34, 197, 94)',
              'rgb(239, 68, 68)',
              'rgb(59, 130, 246)',
              'rgb(245, 158, 11)',
            ],
            borderWidth: 1,
          },
        ],
      },
    });
  }
);

// Get user growth
export const getUserGrowth = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  const { period = '6months' } = req.query;
  const months = getMonthsForPeriod(period as string);

  const [users, businesses] = await Promise.all([
    User.aggregate([
      {
        $match: {
          createdAt: {
            $gte: months[0],
            $lte: new Date(),
          },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
          },
          count: { $sum: 1 },
        },
      },
      {
        $sort: {
          '_id.year': 1,
          '_id.month': 1,
        },
      },
    ]),
    Business.aggregate([
      {
        $match: {
          createdAt: {
            $gte: months[0],
            $lte: new Date(),
          },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
          },
          count: { $sum: 1 },
        },
      },
      {
        $sort: {
          '_id.year': 1,
          '_id.month': 1,
        },
      },
    ]),
  ]);

  const labels = months.map((date) => date.toLocaleDateString('en-US', { month: 'short' }));

  const userData = months.map((date) => {
    const monthData = users.find(
      (u) => u._id.year === date.getFullYear() && u._id.month === date.getMonth() + 1
    );
    return monthData ? monthData.count : 0;
  });

  const businessData = months.map((date) => {
    const monthData = businesses.find(
      (b) => b._id.year === date.getFullYear() && b._id.month === date.getMonth() + 1
    );
    return monthData ? monthData.count : 0;
  });

  res.status(200).json({
    status: 'success',
    data: {
      labels,
      datasets: [
        {
          label: 'Users',
          data: userData,
          backgroundColor: 'rgba(79, 70, 229, 0.8)',
        },
        {
          label: 'Businesses',
          data: businessData,
          backgroundColor: 'rgba(245, 158, 11, 0.8)',
        },
      ],
    },
  });
});

// Helper functions
function getDateFilter(dateRange: string) {
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
    case 'year':
      startDate.setFullYear(now.getFullYear() - 1);
      break;
    default:
      // Default to today if no valid dateRange provided
      startDate.setHours(0, 0, 0, 0);
  }

  // Ensure we have valid dates
  if (isNaN(startDate.getTime()) || isNaN(now.getTime())) {
    // Fallback to today if dates are invalid
    const fallbackStart = new Date();
    fallbackStart.setHours(0, 0, 0, 0);
    return {
      createdAt: {
        $gte: fallbackStart,
        $lte: new Date(),
      },
    };
  }

  return {
    createdAt: {
      $gte: startDate,
      $lte: now,
    },
  };
}

function getMonthsForPeriod(period: string) {
  const months: Date[] = [];
  const now = new Date();
  let count: number;

  switch (period) {
    case '3months':
      count = 3;
      break;
    case '6months':
      count = 6;
      break;
    case '12months':
      count = 12;
      break;
    default:
      count = 6;
  }

  for (let i = count - 1; i >= 0; i--) {
    const date = new Date();
    date.setMonth(now.getMonth() - i);
    months.push(date);
  }

  return months;
}

export const getPlatformStats = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    // Get current date ranges
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    // Get total user wallet balance (sum of all business balances)
    const totalUserWallet = await Business.aggregate([
      { $group: { _id: null, total: { $sum: '$balance' } } },
    ]);

    // Get total users count
    const totalUsers = await User.countDocuments();

    // Get today's transaction stats
    const todayTransactions = await Transaction.aggregate([
      {
        $match: {
          createdAt: {
            $gte: today,
            $lte: todayEnd,
          },
        },
      },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
        },
      },
    ]);

    // Get monthly transaction stats
    const monthlyTransactions = await Transaction.aggregate([
      {
        $match: {
          createdAt: {
            $gte: monthStart,
            $lte: monthEnd,
          },
        },
      },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
        },
      },
    ]);

    // Get existing stats
    const [
      pendingKyc,
      allBusinesses,
      activeUsers,
      totalRevenue,
      totalTransactions,
      completedTransactions,
    ] = await Promise.all([
      Business.countDocuments({ 'compliance.verificationStatus': 'in_progress' }),
      Business.countDocuments(),
      User.countDocuments({ active: true }),
      Transaction.aggregate([{ $group: { _id: null, total: { $sum: '$amount' } } }]),
      Transaction.countDocuments(),
      Transaction.countDocuments({ status: 'completed' }),
    ]);

    // Get current day stats
    const [todayUsers, todayBusinesses, todayCompletedTransactions, todayFailedTransactions] =
      await Promise.all([
        User.countDocuments({ createdAt: { $gte: today, $lte: todayEnd } }),
        Business.countDocuments({ createdAt: { $gte: today, $lte: todayEnd } }),
        Transaction.countDocuments({
          createdAt: { $gte: today, $lte: todayEnd },
          status: 'completed',
        }),
        Transaction.countDocuments({
          createdAt: { $gte: today, $lte: todayEnd },
          status: 'failed',
        }),
      ]);

    // Calculate success rates
    const successRate =
      totalTransactions > 0 ? (completedTransactions / totalTransactions) * 100 : 0;
    const todaySuccessRate =
      (todayTransactions[0]?.count || 0) > 0
        ? (todayCompletedTransactions / (todayTransactions[0]?.count || 1)) * 100
        : 0;

    res.status(200).json({
      status: 'success',
      data: {
        totalUserWallet: totalUserWallet[0]?.total || 0,
        totalUsers,
        todayTransactions: {
          count: todayTransactions[0]?.count || 0,
          amount: todayTransactions[0]?.totalAmount || 0,
        },
        monthlyTransactions: {
          count: monthlyTransactions[0]?.count || 0,
          amount: monthlyTransactions[0]?.totalAmount || 0,
        },
        pendingKyc,
        successRate: Math.round(successRate * 100) / 100, // Round to 2 decimal places
        allBusinesses,
        activeUsers,
        totalRevenue: totalRevenue[0]?.total || 0,
        currentDay: {
          users: todayUsers,
          businesses: todayBusinesses,
          transactions: todayTransactions[0]?.count || 0,
          revenue: todayTransactions[0]?.totalAmount || 0,
          completedTransactions: todayCompletedTransactions,
          failedTransactions: todayFailedTransactions,
          successRate: Math.round(todaySuccessRate * 100) / 100, // Round to 2 decimal places
        },
      },
    });
  }
);
