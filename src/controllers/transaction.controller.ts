import { NextFunction, Request, Response } from 'express';

import { Business } from '@/models/bussiness.model';
import { catchAsync } from '@/utils/catchAsync';
import { Transaction } from '@/models/transaction.model';
import { handlePagination, getPaginationData } from '@/utils/pagination';

export const getBussinessTransactions = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { businessId } = req.params;
    const { page, limit } = handlePagination(req.query.page, req.query.limit);
    const user = req.user;

    // Extract additional filters
    const { status, type, startDate, endDate, minAmount, maxAmount } = req.query;

    // Validate business exists
    const business = await Business.findById(businessId);

    if (!business) {
      return res.status(404).json({
        status: 'error',
        message: 'Business not found',
      });
    }

    // Validate user ownership
    if (user._id.toString() !== business.user.toString()) {
      return res.status(403).json({
        status: 'error',
        message: 'You are not authorized to access this business',
      });
    }

    // Build query
    const query: any = { business: businessId };

    // Add status filter if provided
    if (status && status !== 'all') {
      query.status = status;
    }

    // Add transaction type filter if provided
    if (type && type !== 'all') {
      query.type = type;
    }

    // Add date range filters if provided
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        query.createdAt.$gte = new Date(startDate as string);
      }
      if (endDate) {
        const endDateTime = new Date(endDate as string);
        endDateTime.setHours(23, 59, 59, 999); // Set to end of day
        query.createdAt.$lte = endDateTime;
      }
    }

    // Add amount range filters if provided
    if (minAmount || maxAmount) {
      query.amount = {};
      if (minAmount) {
        query.amount.$gte = Number(minAmount);
      }
      if (maxAmount) {
        query.amount.$lte = Number(maxAmount);
      }
    }

    const [transactions, totalTransactions] = await Promise.all([
      Transaction.find(query)
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('business', 'name')
        .sort({ createdAt: -1 }),
      Transaction.countDocuments(query),
    ]);

    res.status(200).json({
      status: 'success',
      data: transactions,
      pagination: getPaginationData(page, limit, totalTransactions),
    });
  }
);

export const getTransactionDetails = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { transactionId } = req.params;
    const user = req.user;

    const transaction = await Transaction.findById(transactionId).populate('business');
    if (!transaction) {
      return res.status(404).json({
        status: 'error',
        message: 'Transaction not found',
      });
    }

    if (user._id.toString() !== transaction.user.toString()) {
      return res.status(403).json({
        status: 'error',
        message: 'You are not authorized to access this transaction',
      });
    }

    res.status(200).json({
      status: 'success',
      data: transaction,
    });
  }
);

export const searchTransactions = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { search = '' } = req.query;
    const { page, limit } = handlePagination(req.query.page, req.query.limit);
    const user = req.user;

    const baseQuery = { user: user._id };
    const searchQuery = search
      ? {
          ...baseQuery,
          $or: [
            { orderNo: { $regex: search, $options: 'i' } },
            { description: { $regex: search, $options: 'i' } },
            { 'metadata.payerAccountName': { $regex: search, $options: 'i' } },
            { 'metadata.virtualAccountName': { $regex: search, $options: 'i' } },
            { currency: { $regex: search, $options: 'i' } },
          ],
        }
      : baseQuery;

    const [transactions, totalTransactions] = await Promise.all([
      Transaction.find(searchQuery)
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('business', 'name')
        .sort({ createdAt: -1 }),
      Transaction.countDocuments(searchQuery),
    ]);

    res.status(200).json({
      status: 'success',
      data: transactions,
      pagination: getPaginationData(page, limit, totalTransactions),
    });
  }
);
