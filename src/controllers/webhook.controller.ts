import { Request, Response, NextFunction } from 'express';
import { WebhookActivity } from '@/models/webhookActivity.model';
import { AppError } from '@/utils/AppError';
import { catchAsync } from '@/utils/catchAsync';
import { Transaction } from '@/models/transaction.model';
import AccountNumber from '@/models/accountnumber.model';
import { Business } from '@/models/bussiness.model';
import axios from 'axios';
import * as crypto from 'crypto';
import { PaymentNotificationDto } from '@/types/webhook.types';
import { logger } from '../utils/logger';

// Constants
const PAYVESSEL_IP = '47.254.157.75';
const DEFAULT_CHARGE_PERCENTAGE = 1;
const DEFAULT_CHARGE_CAP = 500;

// Types
interface ProcessedPayment {
  transaction: any;
  business: any;
  amountInStandard: number;
  chargeAmount: number;
  netAmountAfterCharges: number;
}

// Helper Functions
const validateIpAddress = (ip: string | string[] | undefined): boolean => {
  return ip === PAYVESSEL_IP;
};

const calculateCharges = (
  amount: number,
  business: any
): { chargeAmount: number; netAmount: number } => {
  let chargeAmount: number;

  // Get business charges configuration
  const businessCharges = business.charges?.payment;

  if (!businessCharges) {
    // Fallback to default charges if no business charges configured
    chargeAmount = Math.min((amount * DEFAULT_CHARGE_PERCENTAGE) / 100, DEFAULT_CHARGE_CAP);
    chargeAmount = Math.round(chargeAmount * 100) / 100;
  } else if (!businessCharges.useDefault) {
    // Business has custom charges and is not using default
    if (businessCharges.type === 'fixed') {
      // Fixed charge type
      chargeAmount = businessCharges.fixedPrice || 0;
    } else {
      // Percentage charge type
      const percentage = businessCharges.percentage || DEFAULT_CHARGE_PERCENTAGE;
      const cap = businessCharges.cap || DEFAULT_CHARGE_CAP;

      chargeAmount = (amount * percentage) / 100;
      chargeAmount = Math.min(chargeAmount, cap);
      chargeAmount = Math.round(chargeAmount * 100) / 100;
    }
  } else {
    // Business is using default charges - use business model defaults
    const percentage = businessCharges.percentage || DEFAULT_CHARGE_PERCENTAGE;
    const cap = businessCharges.cap || DEFAULT_CHARGE_CAP;

    chargeAmount = (amount * percentage) / 100;
    chargeAmount = Math.min(chargeAmount, cap);
    chargeAmount = Math.round(chargeAmount * 100) / 100;
  }

  return {
    chargeAmount,
    netAmount: amount - chargeAmount,
  };
};

const createTransactionRecord = async (
  paymentData: PaymentNotificationDto,
  business: any,
  amountInStandard: number,
  chargeAmount: number,
  netAmountAfterCharges: number
): Promise<any> => {
  const previousBalance = business.balance;
  business.balance += netAmountAfterCharges;
  await business.save();

  return await Transaction.create({
    orderNo: paymentData.orderNo,
    orderId: paymentData.orderNo,
    description: `Payment of ${paymentData.currency}${amountInStandard} from ${paymentData.payerAccountName} (${paymentData.payerBankName})`,
    business: business._id,
    type: 'payment',
    user: business.user,
    amount: amountInStandard,
    currency: paymentData.currency,
    previousBalance,
    newBalance: business.balance,
    status: paymentData.orderStatus === 1 ? 'completed' : 'failed',
    completedAt: new Date(paymentData.updateTime),
    charges: {
      amount: chargeAmount,
      type: 'payment',
      percentage:
        business.charges?.payment?.type === 'fixed'
          ? 0
          : (business.charges?.payment?.percentage ?? DEFAULT_CHARGE_PERCENTAGE),
      fixedPrice: business.charges?.payment?.fixedPrice ?? 0,
      cap: business.charges?.payment?.cap ?? DEFAULT_CHARGE_CAP,
      useDefault: business.charges?.payment?.useDefault ?? true,
      chargeType: business.charges?.payment?.type || 'percentage',
    },
    metadata: {
      payerAccountName: paymentData.payerAccountName,
      payerAccountNo: paymentData.payerAccountNo,
      payerBankName: paymentData.payerBankName,
      virtualAccountName: paymentData.virtualAccountName,
      virtualAccountNo: paymentData.virtualAccountNo,
      createdTime: new Date(paymentData.createdTime),
      updateTime: new Date(paymentData.updateTime),
      grossAmount: amountInStandard,
      netAmount: netAmountAfterCharges,
      chargeAmount,
      chargePercentage:
        business.charges?.payment?.type === 'fixed'
          ? 0
          : (business.charges?.payment?.percentage ?? DEFAULT_CHARGE_PERCENTAGE),
      chargeType: business.charges?.payment?.type || 'percentage',
    },
  });
};

const notifyBusiness = async (
  business: any,
  transaction: any,
  paymentData: PaymentNotificationDto,
  amountInStandard: number
): Promise<void> => {
  if (!business.webhookUrl) return;

  const startTime = Date.now();
  try {
    const timestamp = Date.now().toString();
    const decryptedSecretKey = business.decryptSecretKey(business.secretKey);
    const signature = crypto
      .createHmac('sha256', decryptedSecretKey)
      .update(timestamp)
      .digest('hex');

    let virtualAccountNo;

    if (transaction.metadata instanceof Map) {
      virtualAccountNo = transaction.metadata.get('virtualAccountNo');
    } else if (typeof transaction.metadata === 'object') {
      virtualAccountNo = transaction.metadata?.virtualAccountNo;
    }

    const accountNumber: any = await AccountNumber.findOne({
      accountNumber: virtualAccountNo,
    });

    const description = `incoming payment of ${paymentData.currency}${amountInStandard} from ${paymentData.payerAccountName} (${paymentData.payerBankName})`;
    const requestBody = {
      event: 'payment.received',
      data: {
        transaction: {
          id: transaction._id,
          orderNo: paymentData.orderNo,
          email: accountNumber?.email || '',
          amount: amountInStandard,
          currency: paymentData.currency,
          status: transaction.status,
          charges: transaction.charges,
          metadata: transaction.metadata,
          description,
        },
      },
      timestamp,
      signature,
    };

    const requestHeaders = {
      'Content-Type': 'application/json',
      'x-api-key': business.apiKey,
      'x-signature': signature,
      'x-timestamp': timestamp,
    };

    await axios.post(business.webhookUrl, requestBody, { headers: requestHeaders });

    await WebhookActivity.create({
      businessId: business._id,
      event: 'payment.received',
      webhookUrl: business.webhookUrl,
      requestBody,
      requestHeaders: {
        ...requestHeaders,
        'x-signature': '***REDACTED***',
      },
      responseStatus: 200,
      duration: Date.now() - startTime,
      status: 'success',
      retryCount: 0,
    });
  } catch (error: any) {
    logger.error('Error sending webhook notification:', error);
    await WebhookActivity.create({
      businessId: business._id,
      event: 'payment.received',
      webhookUrl: business.webhookUrl,
      requestBody: {
        event: 'payment.received',
        data: {
          transaction: {
            id: transaction._id,
            orderNo: paymentData.orderNo,
            amount: amountInStandard,
            currency: paymentData.currency,
            status: transaction.status,
            charges: transaction.charges,
            metadata: transaction.metadata,
          },
        },
      },
      requestHeaders: {
        'Content-Type': 'application/json',
        'x-api-key': business.apiKey,
        'x-signature': '***REDACTED***',
        'x-timestamp': Date.now().toString(),
      },
      error: error?.message || 'Unknown error',
      duration: Date.now() - startTime,
      status: 'failed',
      retryCount: 0,
    });
  }
};

const processPayment = async (paymentData: PaymentNotificationDto): Promise<ProcessedPayment> => {
  // Check for duplicate transaction
  const existingTransaction = await Transaction.findOne({ orderNo: paymentData.orderNo });
  if (existingTransaction) {
    logger.info('Payment already processed:', {
      orderNo: paymentData.orderNo,
      transactionId: existingTransaction._id,
      status: existingTransaction.status,
    });
    throw new AppError('Payment already processed', 200);
  }

  // Find and validate account
  const account = await AccountNumber.findOne({ accountNumber: paymentData.virtualAccountNo });
  if (!account) {
    throw new AppError(
      `Account not found for virtual account: ${paymentData.virtualAccountNo}`,
      400
    );
  }

  // Find and validate business
  const business = await Business.findById(account.businessId.toString()).select('+secretKey');
  if (!business) {
    throw new AppError(`Business not found for account: ${paymentData.virtualAccountNo}`, 400);
  }

  // Validate payment status
  if (paymentData.orderStatus !== 1) {
    const orderStatusMeaning = {
      0: 'init',
      1: 'success',
      2: 'failed',
      3: 'Processing',
      4: 'Closed',
      5: 'Refunded',
      6: 'Unknown',
    };
    throw new AppError(
      `Order ${paymentData.orderNo} not successful, status: ${
        orderStatusMeaning[paymentData.orderStatus as keyof typeof orderStatusMeaning]
      }`,
      400
    );
  }

  // Convert amount and calculate charges
  const amountInStandard = paymentData.orderAmount / 100;
  const { chargeAmount, netAmount: netAmountAfterCharges } = calculateCharges(
    amountInStandard,
    business
  );

  // Create transaction record
  const transaction = await createTransactionRecord(
    paymentData,
    business,
    amountInStandard,
    chargeAmount,
    netAmountAfterCharges
  );

  return {
    transaction,
    business,
    amountInStandard,
    chargeAmount,
    netAmountAfterCharges,
  };
};

// Main Controller
export const handlePaymentNotification = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    const ip = req.headers['x-forwarded-for'] || req.headers['x-real-ip'];

    // Find existing webhook activity for this orderNo to track retries
    const existingActivity = await WebhookActivity.findOne({
      event: 'payment.notification',
      'requestBody.orderNo': req.body.orderNo,
    }).sort({ createdAt: -1 });

    const retryCount = existingActivity ? existingActivity.retryCount + 1 : 0;

    // Log all incoming webhook requests
    await WebhookActivity.create({
      businessId: null,
      event: 'payment.notification',
      webhookUrl: 'palmPay',
      requestBody: req.body,
      requestHeaders: req.headers,
      duration: 0,
      status: 'pending',
      retryCount,
    });

    // Validate IP
    if (!validateIpAddress(ip)) {
      await WebhookActivity.create({
        businessId: null,
        event: 'payment.notification',
        webhookUrl: 'palmPay',
        requestBody: req.body,
        requestHeaders: req.headers,
        error: 'Invalid IP address',
        duration: 0,
        status: 'failed',
        retryCount,
      });
      return res.status(401).send('Invalid IP address');
    }

    try {
      const paymentData = req.body as PaymentNotificationDto;
      const processedPayment = await processPayment(paymentData);

      // Notify business if webhook URL is configured
      await notifyBusiness(
        processedPayment.business,
        processedPayment.transaction,
        paymentData,
        processedPayment.amountInStandard
      );

      // Log successful processing
      await WebhookActivity.create({
        businessId: processedPayment.business._id,
        event: 'payment.notification',
        webhookUrl: 'palmPay',
        requestBody: req.body,
        requestHeaders: req.headers,
        responseStatus: 200,
        responseBody: req.body,
        duration: Date.now() - startTime,
        status: 'success',
        retryCount,
      });

      return res.status(200).send('Payment processed successfully');
    } catch (error: any) {
      logger.error('Error processing payment notification:', error);

      // Log error and return appropriate error status for retry
      await WebhookActivity.create({
        businessId: req.body.businessId || null,
        event: 'payment.notification',
        webhookUrl: 'palmPay',
        requestBody: req.body,
        requestHeaders: req.headers,
        error:
          error instanceof Error
            ? error.message
            : error?.message || 'Unknown error processing payment notification',
        duration: Date.now() - startTime,
        status: 'failed',
        retryCount,
      });

      // Return error status to trigger PalmPay retry
      if (error instanceof AppError) {
        return res.status(error.statusCode).send(error.message);
      }

      return res.status(500).send('Error processing payment notification');
    }
  }
);

// Get webhook activities for a business
export const getWebhookActivities = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { _id: businessId } = req.business;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const status = req.query.status as 'success' | 'failed' | undefined;
    const event = req.query.event as string | undefined;
    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;

    // Build query
    const query: any = { businessId };
    if (status) query.status = status;
    if (event) query.event = event;
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = startDate;
      if (endDate) query.createdAt.$lte = endDate;
    }

    // Get total count for pagination
    const total = await WebhookActivity.countDocuments(query);

    // Get activities with pagination
    const activities = await WebhookActivity.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    // Calculate success and failure rates
    const successCount = await WebhookActivity.countDocuments({
      ...query,
      status: 'success',
    });
    const failureCount = await WebhookActivity.countDocuments({
      ...query,
      status: 'failed',
    });

    res.status(200).json({
      status: 'success',
      data: {
        activities,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
        stats: {
          total,
          success: successCount,
          failed: failureCount,
          successRate: total > 0 ? (successCount / total) * 100 : 0,
        },
      },
    });
  }
);

// Get webhook activity details
export const getWebhookActivity = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { _id: businessId } = req.business;
    const { id } = req.params;

    const activity = await WebhookActivity.findOne({
      _id: id,
      businessId,
    });

    if (!activity) {
      return next(new AppError('Webhook activity not found', 404));
    }

    res.status(200).json({
      status: 'success',
      data: activity,
    });
  }
);

// Get webhook activity statistics
export const getWebhookStats = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { _id: businessId } = req.business;
    const startDate = req.query.startDate
      ? new Date(req.query.startDate as string)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Default to last 30 days
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : new Date();

    // Get daily stats
    const dailyStats = await WebhookActivity.aggregate([
      {
        $match: {
          businessId,
          createdAt: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
          },
          total: { $sum: 1 },
          success: {
            $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] },
          },
          failed: {
            $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] },
          },
          avgDuration: { $avg: '$duration' },
        },
      },
      {
        $sort: { _id: 1 },
      },
    ]);

    // Get event-wise stats
    const eventStats = await WebhookActivity.aggregate([
      {
        $match: {
          businessId,
          createdAt: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: '$event',
          total: { $sum: 1 },
          success: {
            $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] },
          },
          failed: {
            $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] },
          },
          avgDuration: { $avg: '$duration' },
        },
      },
    ]);

    res.status(200).json({
      status: 'success',
      data: {
        dailyStats,
        eventStats,
        period: {
          startDate,
          endDate,
        },
      },
    });
  }
);

export const getAllWebhookActivities = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;

    // Get total count for pagination
    const total = await WebhookActivity.countDocuments();

    // Get activities with pagination
    const activities = await WebhookActivity.find()
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    res.status(200).json({
      status: 'success',
      data: activities,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  }
);
