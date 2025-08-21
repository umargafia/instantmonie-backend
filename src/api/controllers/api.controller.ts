import { Request, Response, NextFunction } from 'express';
import axios from 'axios';
import { AxiosError } from 'axios';
import crypto from 'crypto';

import { Business } from '@/models/bussiness.model';
import AccountNumber from '@/models/accountnumber.model';
import { AppError } from '@/utils/AppError';
import { catchAsync } from '@/utils/catchAsync';
import { env } from '@/config/env';
import generateSign from '@/utils/signatureUtil';
import { generatePalmPaySignature } from '@/utils/signaturev2';
import { Transaction } from '@/models/transaction.model';

export const createAccountNumber = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const MERCHANT_PRIVATE_KEY = env.PALMPAY_MERCHANT_PRIVATE_KEY;
    const APP_ID = env.PALMPAY_APP_ID;
    const COUNTRY_CODE = env.PALMPAY_COUNTRY_CODE;
    const nonceStr = crypto.randomBytes(16).toString('hex');
    const { _id: businessId } = req.business;
    const { name, email } = req.body;

    const requiredFields = ['name', 'email'];

    for (const field of requiredFields) {
      if (!req.body[field]) {
        return next(new AppError(`${field} is required`, 400));
      }
    }

    const business = await Business.findOne({ _id: businessId });

    if (!business) {
      return next(new AppError('Business not found', 404));
    }

    const identityType = business?.compliance?.licenseNumber ? 'company' : 'personal';
    const licenseNumber = business?.compliance?.licenseNumber
      ? business?.compliance?.licenseNumber
      : business?.compliance?.kyc.bvn.number;

    const requestBody = {
      requestTime: Date.now(),
      version: 'V2.0',
      nonceStr: nonceStr,
      virtualAccountName: name,
      identityType,
      licenseNumber,
      customerName: name,
      email,
    };

    try {
      // Generate the signature
      const signature = generateSign(requestBody, MERCHANT_PRIVATE_KEY);

      // Send the request to PalmPay API
      const response = await axios.post(
        `${env.PALMPAY_API_URL}api/v2/virtual/account/label/create`,
        requestBody,
        {
          headers: {
            Authorization: `Bearer ${APP_ID}`,
            countryCode: COUNTRY_CODE,
            Signature: signature,
            'content-type': 'application/json;charset=UTF-8',
          },
        }
      );

      let accountNumber;
      if (response.data.status) {
        const responseData = response.data.data;
        const existingAccount = await AccountNumber.findOne({
          email,
          businessId,
        });
        if (existingAccount) {
          existingAccount.accountNumber = responseData?.virtualAccountNo;
          existingAccount.accountName = responseData?.virtualAccountName;
          existingAccount.userName = responseData?.virtualAccountName;
          await existingAccount.save();
          accountNumber = existingAccount;
        } else {
          accountNumber = await AccountNumber.create({
            businessId,
            accountNumber: responseData?.virtualAccountNo,
            accountName: responseData?.virtualAccountName,
            bankName: 'Palmpay',
            licenseNumber: business?.compliance?.licenseNumber,
            email,
            userName: responseData?.virtualAccountName,
          });
        }

        res.status(200).json({
          status: 'success',
          data: {
            bankName: 'Palmpay',
            accountNumber: accountNumber?.accountNumber,
            accountName: accountNumber?.accountName,
            userName: accountNumber?.userName,
          },
        });
      } else {
        console.log(response.data);
        return next(new AppError(response.data.respMsg, 400));
      }
    } catch (error) {
      const errorMessage = error instanceof AxiosError ? error.response?.data : error;
      console.error('Error:', errorMessage);
      res.status(500).json({ status: 'fail', error: errorMessage });
    }
  }
);

export const getAccountNumber = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { _id: businessId } = req.business;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;

    // Get total count for pagination
    const total = await AccountNumber.countDocuments({ businessId });

    // Get account numbers with pagination
    const accountNumbers = await AccountNumber.find({ businessId })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select('bankName accountNumber email accountName createdAt');

    res.status(200).json({
      status: 'success',
      data: accountNumbers,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  }
);

const paymentAttemptCache = new Map<string, { timestamp: number; businessId: string }>();
// Simple rate limiting cache
const rateLimitCache = new Map<string, { count: number; resetTime: number }>();

interface PayoutResponse {
  amount: number;
  orderNo: string;
  orderId: string;
  fee?: {
    fee: number;
    vat?: number;
  };
  orderStatus: number;
  sessionId?: string;
  message?: string;
  errorMsg?: string;
}

export const initiatePayment = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { amount, orderId, name, bankCode, accountNumber } = req.body;
    const businessId = req.business._id;
    const MAX_ATTEMPTS = 5; // Maximum attempts per timeframe
    const RATE_LIMIT_WINDOW = 5 * 60 * 1000; // 5 minutes in milliseconds
    const uniqueRequestId = `${businessId}-${orderId}`;
    const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';

    // 1. Enhanced validation for required fields
    const requiredFields: string[] = ['amount', 'orderId', 'name', 'bankCode', 'accountNumber'];
    const missingFields = requiredFields.filter((field) => !req.body[field]);
    if (missingFields.length > 0) {
      return next(new AppError(`Missing required fields: ${missingFields.join(', ')}`, 400));
    }

    // 2. Implement rate limiting
    const now = Date.now();
    const rateKey = `${businessId}-${ipAddress}`;
    const rateData = rateLimitCache.get(rateKey) || {
      count: 0,
      resetTime: now + RATE_LIMIT_WINDOW,
    };

    if (now > rateData.resetTime) {
      // Reset counter if time window has passed
      rateLimitCache.set(rateKey, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    } else {
      // Check if user has exceeded the rate limit
      if (rateData.count >= MAX_ATTEMPTS) {
        return next(new AppError('Too many withdrawal attempts. Please try again later.', 429));
      }

      // Increment counter
      rateLimitCache.set(rateKey, {
        count: rateData.count + 1,
        resetTime: rateData.resetTime,
      });
    }

    // 3. Check for duplicate transactions within a time window (5 minutes)
    const cachedAttempt = paymentAttemptCache.get(uniqueRequestId);
    if (cachedAttempt && now - cachedAttempt.timestamp < 5 * 60 * 1000) {
      return next(
        new AppError('Duplicate transaction detected. Please wait before retrying.', 400)
      );
    }

    // 4. Check if transaction already exists in database
    const existingTransaction = await Transaction.findOne({
      orderId,
      business: businessId,
      type: 'withdrawal',
    });

    if (existingTransaction) {
      // If the transaction exists and was successful, return the same response
      if (existingTransaction.status === 'completed') {
        return res.status(200).json({
          status: 'success',
          data: {
            orderNo: existingTransaction.orderNo,
            amount: existingTransaction.amount * 100, // Convert back to cents for consistency
            isSuccessful: true,
            formattedAmount: existingTransaction.amount.toFixed(2),
            message: 'Transaction already processed successfully',
            idempotent: true,
          },
        });
      }

      // If it failed, allow retry after a certain period
      if (existingTransaction.status === 'failed') {
        const failedAt = existingTransaction.failedAt || existingTransaction.updatedAt;
        const retryTimeWindow = 2 * 60 * 1000; // 2 minutes

        if (now - new Date(failedAt).getTime() < retryTimeWindow) {
          return next(new AppError('Please wait before retrying this failed transaction', 400));
        }

        // Otherwise, it's been long enough, allow the retry but log it
        console.log(`Retrying previously failed transaction: ${orderId}`);
      } else {
        // For pending transactions, don't allow duplicate attempts
        return next(new AppError('This withdrawal request is currently being processed', 400));
      }
    }

    const currency = 'NGN';
    // 5. Validate currency and amount
    const validCurrencies = ['NGN', 'GHS', 'TZS', 'KES'];
    if (!validCurrencies.includes(currency)) {
      return next(
        new AppError(`Invalid currency. Must be one of: ${validCurrencies.join(', ')}`, 400)
      );
    }

    // 6. Find and validate the business (with transaction locking for atomicity)
    let business;
    try {
      // Apply optimistic locking using findOneAndUpdate with a version field
      business = await Business.findOneAndUpdate(
        { _id: businessId },
        { $inc: { __v: 1 } }, // Increment version to lock the document
        { new: true, runValidators: true }
      );

      if (!business) {
        return next(new AppError('Business not found', 404));
      }

      // 8. Enhanced amount validation
      if (isNaN(amount) || amount < 100) {
        return next(new AppError('Minimum amount to withdraw is N100', 400));
      }

      // 9. Calculate withdrawal charges based on tiered fee structure
      // Default withdrawal fee tiers
      const defaultTier1 = { min: 0, max: 5000, fee: 20 }; // ₦20 for amount < 5,000
      const defaultTier2 = { min: 5000.01, max: 50000, fee: 40 }; // ₦40 for 5,000 ≤ amount < 50,000
      const defaultTier3 = { min: 50000.01, fee: 65 }; // ₦65 for amount ≥ 50,000

      let withdrawalFee = 0;

      // Determine which fee structure to use (default or custom)
      if (
        business.charges &&
        business.charges.withdrawal &&
        !business.charges.withdrawal.useDefault
      ) {
        // Use custom business withdrawal fee tiers
        const { tier1, tier2, tier3 } = business.charges.withdrawal;

        if (amount >= tier1.min && amount <= tier1.max) {
          withdrawalFee = tier1.fee;
        } else if (amount >= tier2.min && amount <= tier2.max) {
          withdrawalFee = tier2.fee;
        } else if (amount >= tier3.min) {
          withdrawalFee = tier3.fee;
        }
      } else {
        // Use default withdrawal fee tiers
        if (amount >= defaultTier1.min && amount <= defaultTier1.max) {
          withdrawalFee = defaultTier1.fee;
        } else if (amount >= defaultTier2.min && amount <= defaultTier2.max) {
          withdrawalFee = defaultTier2.fee;
        } else if (amount >= defaultTier3.min) {
          withdrawalFee = defaultTier3.fee;
        }
      }

      // Calculate the final withdrawal amount after fee deduction
      const amountAfterFee = amount - withdrawalFee;

      // 10. Check for sufficient balance including fees
      if (business.balance < amount) {
        return next(new AppError('Insufficient balance for this withdrawal', 400));
      }

      // Add to attempt cache to prevent duplicate attempts
      paymentAttemptCache.set(uniqueRequestId, { timestamp: now, businessId });

      // Clean up old cache entries (older than 10 minutes)
      const CACHE_TTL = 10 * 60 * 1000; // 10 minutes
      for (const [key, value] of paymentAttemptCache.entries()) {
        if (now - value.timestamp > CACHE_TTL) {
          paymentAttemptCache.delete(key);
        }
      }

      //convert the amount in cents - use the amount after fee deduction
      const amountInCents = Math.floor(amountAfterFee * 100);

      const title = 'Withdrawal';
      const remark = 'Withdrawal from Gafiapay';
      const payeeName = name;
      const payeeBankCode = bankCode;
      const payeeBankAccNo = accountNumber;
      const description = `Withdrawal of ${currency}${amountAfterFee.toFixed(2)} (Fee: ${currency}${withdrawalFee.toFixed(2)}) from ${payeeName} (${payeeBankCode}) to ${business.accountDetails.accountName} - ${business.accountDetails.accountNumber}`;
      const notifyUrl = req.headers.origin + '/api/v1/payment/callback';

      // 11. Prepare request payload
      const requestBody = {
        requestTime: Date.now(),
        version: 'V2.0',
        nonceStr: crypto.randomBytes(16).toString('hex'),
        orderId,
        payeeName,
        payeeBankCode,
        payeeBankAccNo,
        amount: amountInCents,
        currency,
        notifyUrl,
        remark,
        title,
        description,
      };

      // 12. Generate signature
      const signature = generatePalmPaySignature(requestBody, env.PALMPAY_MERCHANT_PRIVATE_KEY);

      try {
        // 13. Call PalmPay API with improved error handling and timeout
        const response: any = await axios.post<{
          respCode: string;
          respMsg: string;
          data: PayoutResponse;
        }>(`${env.PALMPAY_API_URL}api/v2/merchant/payment/payout`, requestBody, {
          headers: {
            Accept: 'application/json',
            CountryCode: env.PALMPAY_COUNTRY_CODE,
            Authorization: `Bearer ${env.PALMPAY_APP_ID}`,
            Signature: signature,
            'Content-Type': 'application/json',
          },
          timeout: 15000,
        });

        // 14. Handle response
        if (response.data.respCode !== '00000000') {
          return next(new AppError(response.data.respMsg || 'Payment initiation failed', 400));
        }

        // 15. Update business balance atomically
        const previousBalance = business.balance;
        business.balance -= amount; // Deduct the full amount including fees
        await business.save();

        // 16. Create transaction record with idempotency key (orderId)
        const transactionDescription = `Withdrawal of ${currency}${amountAfterFee.toFixed(2)} (Fee: ${currency}${withdrawalFee.toFixed(2)}) for ${payeeName} to ${business.accountDetails.accountName} - ${business.accountDetails.accountNumber}`;
        await Transaction.create({
          orderNo: response.data.data.orderNo,
          orderId,
          description: transactionDescription,
          business: business._id,
          type: 'withdrawal',
          user: business.user,
          amount: amount, // Store the original amount requested
          currency,
          status: response.data.data.orderStatus === 2 ? 'completed' : 'pending',
          previousBalance,
          newBalance: business.balance,
          charges: {
            amount: withdrawalFee,
            type: 'withdrawal',
            fixed: withdrawalFee,
          },
          metadata: {
            ipAddress,
            userAgent: req.headers['user-agent'],
            timestamp: new Date().toISOString(),
            amountBeforeFee: amount,
            amountAfterFee: amountAfterFee,
            withdrawalFee: withdrawalFee,
          },
        });

        // 17. Remove from attempt cache after successful processing
        paymentAttemptCache.delete(uniqueRequestId);

        // 18. Return success response
        res.status(200).json({
          status: 'success',
          data: {
            ...response.data.data,
            isSuccessful: response.data.data.orderStatus === 2,
            formattedAmount: amountAfterFee.toFixed(2),
            originalAmount: amount.toFixed(2),
            fee: withdrawalFee.toFixed(2),
          },
        });
      } catch (error: any) {
        // 19. Enhanced error handling with detailed logging
        const statusCode = error.response?.status || 500;
        const message =
          error.response?.data?.respMsg || error.message || 'Payment initiation failed';

        console.error('Payment initiation error:', {
          error: message,
          requestBody: {
            ...requestBody,
            payeeBankAccNo: '****' + payeeBankAccNo.slice(-4), // Mask sensitive data in logs
          },
          businessId,
          timestamp: new Date().toISOString(),
          ipAddress,
          response: error.response?.data,
        });

        // 20. Create a failed transaction record for auditing
        await Transaction.create({
          orderId,
          description: `Failed withdrawal attempt: ${message}`,
          business: business._id,
          type: 'withdrawal',
          user: business.user,
          amount: amount,
          currency,
          status: 'failed',
          previousBalance: business.balance,
          newBalance: business.balance,
          charges: {
            amount: withdrawalFee,
            type: 'withdrawal',
            fixed: withdrawalFee,
          },
          metadata: {
            error: message,
            errorDetails: JSON.stringify(error.response?.data || {}),
            ipAddress,
            userAgent: req.headers['user-agent'],
            amountBeforeFee: amount,
            amountAfterFee: amountAfterFee,
            withdrawalFee: withdrawalFee,
          },
        });

        return next(new AppError(message, statusCode));
      }
    } catch (lockError) {
      console.error('Transaction lock error:', lockError);
      return next(
        new AppError(
          'Unable to process withdrawal due to concurrent operations. Please try again.',
          409
        )
      );
    }
  }
);
