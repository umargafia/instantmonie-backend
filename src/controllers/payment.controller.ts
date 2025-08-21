import { NextFunction, Request, Response } from 'express';
import axios from 'axios';
import crypto from 'crypto';

import { Business } from '@/models/bussiness.model';
import { catchAsync } from '@/utils/catchAsync';
import { verifySignature } from '@/utils/verifySignature';
import { Transaction } from '@/models/transaction.model';
import { TransactionStatus } from '@/models/transaction.model';
import AccountNumber from '@/models/accountnumber.model';
import { formatAmount } from '@/utils/formatAmount';
import { env } from '@/config/env';
import generateSign from '@/utils/signatureUtil';
import { AppError } from '@/utils/AppError';
import { generatePalmPaySignature } from '@/utils/signaturev2';

const nonceStr = crypto.randomBytes(16).toString('hex');

export const receivePayment = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const requestIp = req.ip || req.socket.remoteAddress || 'unknown';
    const requestTime = new Date().toISOString();
    let transaction = null;

    // Important: Respond quickly to the webhook call to prevent retries
    // Most payment providers expect a quick 200 response
    // We'll send the initial acknowledgement and process asynchronously
    const webhookId =
      req.headers['x-webhook-id'] ||
      `webhook-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;

    // 1. Verify the webhook signature first - this must be fast
    if (!verifySignature(req.body)) {
      console.error(
        `[${requestTime}] Invalid webhook signature for ID: ${webhookId} from ${requestIp}`
      );

      // Always return 200 to prevent retries, but indicate error in response
      return res.status(200).json({
        status: 'error',
        message: 'Invalid signature',
        webhookId,
        timestamp: requestTime,
      });
    }

    // 2. Send immediate acknowledgement to the webhook provider
    // This prevents timeouts and unnecessary retries
    res.status(200).json({
      status: 'success',
      message: 'Webhook received, processing payment',
      webhookId,
      timestamp: requestTime,
    });

    // 3. Process the webhook asynchronously after responding
    // This is important because webhook providers often timeout after a few seconds
    (async () => {
      try {
        // Extract payload data
        const {
          orderNo,
          orderAmount,
          currency,
          payerAccountNo,
          payerAccountName,
          payerBankName,
          virtualAccountNo,
          virtualAccountName,
          accountReference,
        } = req.body;

        // Validate required fields
        const requiredFields = {
          orderNo,
          orderAmount,
          virtualAccountNo,
        };

        const missingFields = Object.entries(requiredFields)
          .filter(([_, value]) => !value)
          .map(([field]) => field);

        if (missingFields.length > 0) {
          console.error(
            `[${requestTime}] Webhook ${webhookId}: Missing required fields: ${missingFields.join(', ')}`
          );
          return; // Exit the async function, we already responded to the webhook
        }

        // Validate amount
        if (isNaN(orderAmount) || orderAmount <= 0) {
          console.error(
            `[${requestTime}] Webhook ${webhookId}: Invalid order amount: ${orderAmount}`
          );
          return;
        }

        // 4. Handle idempotency - Check if this webhook has already been processed
        const existingTransaction = await Transaction.findOne({
          orderNo,
          'metadata.webhookId': webhookId,
        });

        if (existingTransaction) {
          console.warn(
            `[${requestTime}] Webhook ${webhookId}: Already processed (Duplicate webhook)`
          );
          return;
        }

        // Check for transaction with same orderNo but different webhookId
        // This could indicate a genuine retry from the payment provider
        const sameOrderTransaction = await Transaction.findOne({ orderNo });
        if (sameOrderTransaction) {
          console.warn(
            `[${requestTime}] Webhook ${webhookId}: Transaction with orderNo ${orderNo} already exists with different webhookId`
          );
          // We'll log but continue processing in case this is a legitimate update to the transaction
        }

        // 5. Find account and validate
        const account = await AccountNumber.findOne({ accountNumber: virtualAccountNo }).populate(
          'businessId'
        );
        if (!account) {
          console.error(
            `[${requestTime}] Webhook ${webhookId}: Account not found: ${virtualAccountNo}`
          );
          return;
        }

        // 6. Find and validate business
        let business = await Business.findById(account.businessId);
        if (!business) {
          console.error(
            `[${requestTime}] Webhook ${webhookId}: Business not found for account: ${virtualAccountNo}`
          );
          return;
        }

        // 7. Use database transaction or locking to ensure data consistency
        // Start a session for transaction atomicity if MongoDB supports it
        // OR use optimistic locking as shown below
        business = await Business.findOneAndUpdate(
          { _id: business._id },
          { $inc: { __v: 1 } }, // Increment version for optimistic locking
          { new: true, runValidators: true }
        );

        if (!business) {
          throw new Error(`Failed to acquire lock on business document for webhook ${webhookId}`);
        }

        // 8. Calculate the payment charges
        const amountInStandard = orderAmount / 100; // Convert from cents to standard currency unit

        // Calculate charge amount based on business configuration
        let chargeAmount: number;
        let chargePercentage: number;
        let chargeType: string;

        const businessCharges = business.charges?.payment;

        if (!businessCharges) {
          // Fallback to default charges if no business charges configured
          chargePercentage = 1.5; // Default 1.5%
          chargeAmount = Math.min((amountInStandard * chargePercentage) / 100, 500);
          chargeType = 'percentage';
        } else if (!businessCharges.useDefault) {
          // Business has custom charges and is not using default
          if (businessCharges.type === 'fixed') {
            chargeAmount = businessCharges.fixedPrice || 0;
            chargePercentage = 0;
            chargeType = 'fixed';
          } else {
            chargePercentage = businessCharges.percentage || 1.5;
            const cap = businessCharges.cap || 500;
            chargeAmount = (amountInStandard * chargePercentage) / 100;
            chargeAmount = Math.min(chargeAmount, cap);
            chargeType = 'percentage';
          }
        } else {
          // Business is using default charges - use business model defaults
          chargePercentage = businessCharges.percentage || 1.5;
          const cap = businessCharges.cap || 500;
          chargeAmount = (amountInStandard * chargePercentage) / 100;
          chargeAmount = Math.min(chargeAmount, cap);
          chargeType = 'percentage';
        }

        // Round to 2 decimal places
        chargeAmount = Math.round(chargeAmount * 100) / 100;

        // Final amount to be credited to the business after charges
        const netAmountAfterCharges = amountInStandard - chargeAmount;

        // 9. Update business balance with the net amount
        const previousBalance = business.balance;
        business.balance += netAmountAfterCharges;

        // 10. Create transaction with webhook metadata and charge information
        const formattedAmount = formatAmount(orderAmount, currency);
        const description = `Payment Transfer of ${currency}${formattedAmount} from ${payerAccountName || 'Unknown'} (${payerBankName || 'Unknown'}) to ${virtualAccountName} was successful`;

        transaction = await Transaction.create({
          orderNo,
          description,
          business: business._id,
          type: 'payment',
          user: business.user,
          amount: amountInStandard,
          currency: currency || 'NGN',
          previousBalance,
          newBalance: business.balance,
          status: 'completed',
          completedAt: new Date(),
          charges: {
            amount: chargeAmount,
            type: 'payment',
            percentage: chargePercentage,
            chargeType: chargeType,
          },
          metadata: {
            payerAccountName,
            payerAccountNo,
            payerBankName,
            virtualAccountName,
            virtualAccountNo,
            accountReference,
            ipAddress: requestIp,
            timestamp: requestTime,
            userAgent: req.headers['user-agent'],
            webhookId,
            webhookHeaders: JSON.stringify(req.headers),
            webhookBody: JSON.stringify(req.body),
            grossAmount: amountInStandard,
            netAmount: netAmountAfterCharges,
            chargeAmount: chargeAmount,
            chargePercentage: chargePercentage,
            chargeType: chargeType,
          },
        });

        // 11. Save business after creating transaction
        await business.save();

        // 12. Log success with charge information
        console.log(`[${requestTime}] Webhook ${webhookId}: Payment processed successfully: 
          OrderNo: ${orderNo}
          Gross Amount: ${currency}${formattedAmount}
          Charge (${chargePercentage}%): ${currency}${chargeAmount.toFixed(2)}
          Net Amount: ${currency}${netAmountAfterCharges.toFixed(2)}
          Business: ${business.name}
          Transaction ID: ${transaction._id}
        `);

        // 13. Additional webhook-specific processing
        // For example, notify the business owner by email or push notification
        // This could be done via a message queue for reliability
      } catch (error: any) {
        // Log the error but don't send a response (already sent)
        console.error(`[${requestTime}] Webhook ${webhookId} processing error:`, error);

        // If a transaction was started but the process failed, mark it as failed
        if (transaction && transaction._id) {
          try {
            await Transaction.findByIdAndUpdate(transaction._id, {
              status: 'failed',
              failedAt: new Date(),
              'metadata.error': error.message || 'Unknown error',
              'metadata.errorStack': error.stack,
              'metadata.webhookProcessingFailed': true,
            });
            console.log(
              `[${requestTime}] Webhook ${webhookId}: Marked transaction ${transaction._id} as failed`
            );
          } catch (updateError: any) {
            console.error(
              `[${requestTime}] Webhook ${webhookId}: Failed to update transaction status:`,
              updateError
            );
          }
        }
      }
    })().catch((processError: any) => {
      // Catch any unhandled errors in the async function
      console.error(
        `[${requestTime}] Unhandled webhook processing error for ID: ${webhookId}:`,
        processError
      );
    });
  }
);

interface BalanceResponse {
  availableBalance: number;
  frozenBalance: number;
  currentBalance: number;
  unSettleBalance: number;
}

interface CachedBalance {
  data: BalanceResponse;
  timestamp: number;
}

const balanceCache = new Map<string, CachedBalance>();

export const queryMerchantBalance = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const merchantId = env.PALMPAY_MERCHANT_ID;

    // Check cache first
    if (balanceCache.has(merchantId)) {
      const cached = balanceCache.get(merchantId);
      if (cached && Date.now() - cached.timestamp < 30000) {
        // 30 seconds
        return res.json({
          status: 'success',
          data: cached.data,
        });
      }
    }

    // 2. Prepare request payload
    const requestBody = {
      requestTime: Date.now(),
      version: 'V2.0',
      nonceStr: crypto.randomBytes(16).toString('hex'),
      merchantId: merchantId,
    };

    // 3. Generate signature
    const signature = generateSign(requestBody, env.PALMPAY_MERCHANT_PRIVATE_KEY);
    try {
      // 4. Call PalmPay API
      const response = await axios.post<{
        respCode: string;
        respMsg: string;
        data: BalanceResponse;
      }>(`${env.PALMPAY_API_URL}api/v2/merchant/manage/account/queryBalance`, requestBody, {
        headers: {
          Accept: 'application/json',
          CountryCode: env.PALMPAY_COUNTRY_CODE,
          Authorization: `Bearer ${env.PALMPAY_APP_ID}`,
          Signature: signature,
          'Content-Type': 'application/json',
        },
      });

      if (response.data.respCode === '00000000') {
        // Cache the result// Update cache
        balanceCache.set(merchantId, {
          data: response.data.data,
          timestamp: Date.now(),
        });

        // Convert amounts from cents to Naira if needed
        const balanceData = {
          availableBalance: response.data.data.availableBalance / 100,
          frozenBalance: response.data.data.frozenBalance / 100,
          currentBalance: response.data.data.currentBalance / 100,
          unSettleBalance: response.data.data.unSettleBalance / 100,
          currency: 'NGN',
        };

        res.status(200).json({
          status: 'success',
          data: balanceData,
        });
      } else {
        return next(new AppError(response.data.respMsg, 400));
      }
    } catch (error: any) {
      return next(new AppError(error.message, 400));
    }
  }
);

export const getBankList = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  // 1. Prepare request parameters
  const requestBody = {
    requestTime: Date.now(),
    version: 'V2.0',
    nonceStr,
    businessType: req.body.businessType || 0, // Default to 0 (all banks)
  };

  // 2. Generate signature
  const signature = generateSign(requestBody, env.PALMPAY_MERCHANT_PRIVATE_KEY);
  const url = `${env.PALMPAY_API_URL}api/v2/general/merchant/queryBankList`;

  try {
    // 3. Make request to PalmPay API
    const response = await axios.post(url, requestBody, {
      headers: {
        Accept: 'application/json',
        CountryCode: env.PALMPAY_COUNTRY_CODE,
        Authorization: `Bearer ${env.PALMPAY_APP_ID}`,
        Signature: signature,
        'Content-Type': 'application/json',
      },
    });
    if (response.status !== 200) {
      return next(new AppError(response.data.message, 400));
    }
    res.status(200).json({
      status: 'success',
      data: response.data,
    });
  } catch (error: any) {
    console.log('error', error);
    return next(new AppError(error.message, 400));
  }
});

interface BankAccountResponse {
  respCode: string;
  respMsg: string;
  data: {
    status: 'Success' | 'Failed';
    accountName?: string;
    errorMessage?: string;
  };
}

export const verifyBankAccount = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { bankCode, accountNumber } = req.body;

    // 1. Enhanced Input Validation
    const validationErrors: string[] = [];

    if (!bankCode?.trim()) validationErrors.push('Bank code is required');
    if (!accountNumber?.trim()) validationErrors.push('Account number is required');

    if (validationErrors.length > 0) {
      return next(new AppError(validationErrors.join(', '), 400));
    }

    // 2. Specific Validation Rules
    const cleanedBankCode = bankCode.trim();
    const cleanedAccNo = accountNumber.replace(/\D/g, ''); // Remove all non-digits

    if (cleanedBankCode === '100033') {
      return next(
        new AppError('Please use the PalmPay account query interface for PalmPay accounts', 400)
      );
    }

    if (!/^\d{6}$/.test(cleanedBankCode)) {
      return next(new AppError('Bank code must be 6 digits', 400));
    }

    if (cleanedAccNo.length < 8 || cleanedAccNo.length > 20) {
      return next(new AppError('Account number must be between 8-20 digits', 400));
    }

    // 3. Prepare Request Payload
    const requestBody = {
      requestTime: Date.now(), // 13-digit timestamp
      version: 'V1.1', // Note: Changed from V2.0 to match PalmPay's working example
      nonceStr: crypto.randomBytes(16).toString('hex'), // 32-char random string
      bankCode: cleanedBankCode,
      bankAccNo: cleanedAccNo,
    };

    // 4. Generate and Verify Signature
    let signature: string;
    try {
      signature = generateSign(requestBody, env.PALMPAY_MERCHANT_PRIVATE_KEY);
    } catch (signError) {
      console.error('Signature generation failed:', signError);
      return next(new AppError('Internal server error during signature generation', 500));
    }

    // 5. API Request with Enhanced Config
    try {
      const response: any = await axios.post<BankAccountResponse>(
        `${env.PALMPAY_API_URL}api/v2/payment/merchant/payout/queryBankAccount`,
        requestBody,
        {
          headers: {
            CountryCode: env.PALMPAY_COUNTRY_CODE,
            Authorization: `Bearer ${env.PALMPAY_APP_ID}`,
            Signature: signature,
            'Content-Type': 'application/json',
          },
          timeout: 10000, // 10-second timeout
          validateStatus: (status) => status < 500, // Don't throw for 4xx errors
        }
      );

      // 6. Handle Response
      if (response.data.respCode !== '00000000') {
        const errorMessage =
          response.data.data?.errorMessage ||
          response.data.respMsg ||
          'Bank account verification failed';
        return next(new AppError(errorMessage, 400));
      }

      // 7. Success Response
      res.status(200).json({
        status: 'success',
        data: {
          isValid: response.data.data.Status === 'Success',
          accountName: response.data.data.accountName,
          bankCode: cleanedBankCode,
          lastFourDigits: cleanedAccNo.slice(-4), // For security
        },
      });
    } catch (error: any) {
      // 8. Enhanced Error Handling
      const errorDetails = {
        requestBody,
        statusCode: error.response?.status,
        palmPayError: error.response?.data,
        timestamp: new Date().toISOString(),
      };

      console.error('Bank Account Verification Failed:', errorDetails);

      const userMessage =
        error.response?.data?.respMsg || 'Unable to verify bank account at this time';

      return next(new AppError(userMessage, error.response?.status || 500));
    }
  }
);
interface PalmPayAccountResponse {
  accountName: string;
  accountStatus: number;
}

export const queryPalmPayAccount = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { palmpayAccNo } = req.body;

    // 1. Validate input
    if (!palmpayAccNo) {
      return next(new AppError('PalmPay account number is required', 400));
    }

    // 2. Prepare request payload
    const requestBody = {
      requestTime: Date.now(),
      version: 'V1.1',
      nonceStr: crypto.randomBytes(16).toString('hex'),
      palmpayAccNo: palmpayAccNo.trim(), // Trim whitespace
    };

    // 3. Generate signature
    const signature = generateSign(requestBody, env.PALMPAY_MERCHANT_PRIVATE_KEY);

    try {
      // 4. Call PalmPay API
      const response = await axios.post<{
        respCode: string;
        respMsg: string;
        data: PalmPayAccountResponse;
      }>(`${env.PALMPAY_API_URL}api/v2/payment/merchant/payout/queryAccount`, requestBody, {
        headers: {
          CountryCode: env.PALMPAY_COUNTRY_CODE,
          Authorization: `Bearer ${env.PALMPAY_APP_ID}`,
          Signature: signature,
          'Content-Type': 'application/json',
        },
        timeout: 10000, // 10 second timeout
      });

      // 5. Handle response
      if (response.data.respCode !== '00000000') {
        return next(new AppError(response.data.respMsg, 400));
      }

      res.status(200).json({
        status: 'success',
        data: {
          accountName: response.data.data.accountName,
          accountStatus: response.data.data.accountStatus,
          isActive: response.data.data.accountStatus === 0,
        },
      });
    } catch (error: any) {
      // Improved error handling
      const statusCode = error.response?.status || 500;
      const message = error.response?.data?.respMsg || 'Failed to query PalmPay account';

      console.error('PalmPay account query error:', {
        error: error.message,
        response: error.response?.data,
      });

      return next(new AppError(message, statusCode));
    }
  }
);

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

// Cache to prevent duplicate transactions within a time window
const paymentAttemptCache = new Map<string, { timestamp: number; businessId: string }>();
// Simple rate limiting cache
const rateLimitCache = new Map<string, { count: number; resetTime: number }>();

export const initiatePayment = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { amount, businessId, orderId, otp } = req.body;
    const MAX_ATTEMPTS = 5; // Maximum attempts per timeframe
    const RATE_LIMIT_WINDOW = 5 * 60 * 1000; // 5 minutes in milliseconds
    const uniqueRequestId = `${businessId}-${orderId}`;
    const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';

    // 1. Enhanced validation for required fields
    const requiredFields: string[] = ['amount', 'businessId', 'orderId', 'otp'];
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
      const remark = 'Withdrawal from PalmPay';
      const payeeName = business.name;
      const payeeBankCode = business.accountDetails.bankCode;
      const payeeBankAccNo = business.accountDetails.accountNumber;
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

export const checkWithdrawalStatus = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { transactionId, orderId } = req.params;
    const { businessId } = req.query;

    // Validate input
    if (!businessId) {
      return next(new AppError('Business ID is required', 400));
    }

    if (!transactionId && !orderId) {
      return next(new AppError('Either transactionId or orderId is required', 400));
    }

    // Query for transaction
    let transaction;

    if (transactionId) {
      // If transactionId (MongoDB _id) is provided, use it directly
      transaction = await Transaction.findOne({
        _id: transactionId,
        business: businessId,
        type: 'withdrawal',
      });
    } else {
      // Otherwise use orderId (client-generated ID)
      transaction = await Transaction.findOne({
        orderId,
        business: businessId,
        type: 'withdrawal',
      });
    }

    if (!transaction) {
      return next(new AppError('Transaction not found', 404));
    }

    // If transaction exists but is still pending, check with PalmPay for latest status
    if (transaction.status === 'pending' && transaction.orderNo) {
      try {
        // Create request to check status with PalmPay
        const requestBody = {
          requestTime: Date.now(),
          version: 'V2.0',
          nonceStr: crypto.randomBytes(16).toString('hex'),
          orderNo: transaction.orderNo,
        };

        const signature = generatePalmPaySignature(requestBody, env.PALMPAY_MERCHANT_PRIVATE_KEY);

        const response = await axios.post(
          `${env.PALMPAY_API_URL}api/v2/merchant/payment/queryPayStatus`,
          requestBody,
          {
            headers: {
              Accept: 'application/json',
              CountryCode: env.PALMPAY_COUNTRY_CODE,
              Authorization: `Bearer ${env.PALMPAY_APP_ID}`,
              Signature: signature,
              'Content-Type': 'application/json',
            },
            timeout: 10000,
          }
        );

        // Process response and update transaction if needed
        if (response.data.respCode === '00000000') {
          const payoutStatus = response.data.data.orderStatus;
          // Map PalmPay status to our status
          let newStatus: TransactionStatus;
          switch (payoutStatus) {
            case 2: // Success
              newStatus = 'completed';
              break;
            case 3: // Failed
              newStatus = 'failed';
              break;
            case 4: // Cancelled
              newStatus = 'cancelled';
              break;
            default: // 1: Processing or other
              newStatus = 'pending';
          }

          // Update transaction if status has changed
          if (newStatus !== transaction.status) {
            transaction.status = newStatus;
            await transaction.save();
          }
        } else {
          return next(new AppError(response.data.respMsg, 400));
        }
      } catch (error: any) {
        return next(new AppError(error.response.data.respMsg, 400));
      }
    }

    // Add human-readable status message
    let statusMessage;
    switch (transaction.status) {
      case 'completed':
        statusMessage = 'Withdrawal completed successfully';
        break;
      case 'pending':
        statusMessage = 'Withdrawal is being processed';
        break;
      case 'failed':
        statusMessage = 'Withdrawal failed';
        break;
      case 'cancelled':
        statusMessage = 'Withdrawal was cancelled';
        break;
      default:
        statusMessage = `Withdrawal status: ${transaction.status}`;
    }

    // Return transaction details
    res.status(200).json({
      status: 'success',
      data: {
        transactionId: transaction._id,
        orderId: transaction.orderId,
        orderNo: transaction.orderNo,
        amount: transaction.amount,
        formattedAmount: transaction.amount.toFixed(2),
        status: transaction.status,
        statusMessage,
        createdAt: transaction.createdAt,
        completedAt: transaction.completedAt,
        failedAt: transaction.failedAt,
        cancelledAt: transaction.cancelledAt,
      },
    });
  }
);
