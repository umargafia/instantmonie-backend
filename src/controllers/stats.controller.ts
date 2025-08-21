import { Business } from '@/models/bussiness.model';
import { AppError } from '@/utils/AppError';
import { catchAsync } from '@/utils/catchAsync';
import { Request, Response, NextFunction } from 'express';
import { Transaction } from '@/models/transaction.model';

export const getBusinessStats = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const timeframe = req.query.timeframe || 'week'; // Default to week

    // Verify business exists and user has access
    const business = await Business.findById(id);
    if (!business) {
      return next(new AppError('Business not found', 404));
    }

    if (business.user.toString() !== req.user._id.toString()) {
      return next(new AppError('You are not authorized to access this business statistics', 403));
    }

    // Get current date and set time ranges
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);

    // Calculate start date based on timeframe
    let startDate = new Date();
    let interval = 'day';
    let format = '%Y-%m-%d';

    if (timeframe === 'week') {
      startDate.setDate(startDate.getDate() - 7);
      interval = 'day';
      format = '%Y-%m-%d';
    } else if (timeframe === 'month') {
      startDate.setDate(startDate.getDate() - 30);
      interval = 'day';
      format = '%Y-%m-%d';
    } else if (timeframe === 'year') {
      startDate.setFullYear(startDate.getFullYear() - 1);
      interval = 'month';
      format = '%Y-%m';
    }

    // 1. Get account balance (current balance from business)
    const accountBalance = business.balance;

    // 2. Get today's income (sum of completed payment transactions for today)
    const dailyIncomeQuery = await Transaction.aggregate([
      {
        $match: {
          business: business._id,
          type: 'payment',
          status: 'completed',
          createdAt: { $gte: today, $lte: todayEnd },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' },
        },
      },
    ]);

    const dailyIncome = dailyIncomeQuery.length > 0 ? dailyIncomeQuery[0].total : 0;

    // 3. Get total number of transactions
    const totalTransactions = await Transaction.countDocuments({ business: business._id });

    // 4. Get total withdrawals
    const totalWithdrawalsQuery = await Transaction.aggregate([
      {
        $match: {
          business: business._id,
          type: 'withdrawal',
          status: 'completed',
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' },
        },
      },
    ]);

    const totalWithdrawals = totalWithdrawalsQuery.length > 0 ? totalWithdrawalsQuery[0].total : 0;

    // 5. Get revenue trend over selected period
    const revenueTrend = await Transaction.aggregate([
      {
        $match: {
          business: business._id,
          type: 'payment',
          status: 'completed',
          createdAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format, date: '$createdAt' } },
          revenue: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
      {
        $sort: { _id: 1 },
      },
    ]);

    // 6. Get transaction status overview
    const transactionStatusOverview = await Transaction.aggregate([
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
          amount: { $sum: '$amount' },
        },
      },
    ]);

    // 7. Get transaction type breakdown
    const transactionTypeBreakdown = await Transaction.aggregate([
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
          amount: { $sum: '$amount' },
        },
      },
    ]);

    res.status(200).json({
      status: 'success',
      data: {
        summary: {
          accountBalance,
          dailyIncome,
          totalTransactions,
          totalWithdrawals,
        },
        revenueTrend,
        transactionStatusOverview,
        transactionTypeBreakdown,
        timeframe,
      },
    });
  }
);
