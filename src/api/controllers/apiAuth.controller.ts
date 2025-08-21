import { Request, Response, NextFunction } from 'express';
import { Business } from '@/models/bussiness.model';
import { AppError } from '@/utils/AppError';
import { catchAsync } from '@/utils/catchAsync';
import crypto from 'crypto';

export const protectApi = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  // 1) Get API key and check if it exists
  const apiKey = req.headers['x-api-key'];
  const signature = req.headers['x-signature'];
  const timestamp = req.headers['x-timestamp'];

  // For GET requests with no body, signature is not required
  const isGetWithoutBody =
    req.method === 'GET' && (!req.body || Object.keys(req.body).length === 0);

  // Required headers logic
  const requiredHeaders = isGetWithoutBody
    ? ['x-api-key', 'x-timestamp']
    : ['x-api-key', 'x-signature', 'x-timestamp'];

  for (const header of requiredHeaders) {
    if (!req.headers[header]) {
      return next(new AppError(`Missing required header: ${header}`, 401));
    }
  }

  // 2) Find business by API key
  const business = await Business.findOne({ apiKey }).select('+secretKey');
  if (!business) {
    return next(new AppError('Invalid API key', 401));
  }

  if (business.compliance.verificationStatus !== 'completed') {
    return next(new AppError('Business not verified', 401));
  }

  // 3) Verify timestamp (within 5 minutes)
  const requestTime = parseInt(timestamp as string);
  const currentTime = Date.now();
  const timeDiff = Math.abs(currentTime - requestTime);

  if (timeDiff > 5 * 60 * 1000) {
    // 5 minutes
    return next(new AppError('Request timestamp expired', 401));
  }

  // 4) Verify signature (skip for GET with no body)
  if (!isGetWithoutBody) {
    if (req.body && Object.keys(req.body).length > 0) {
      const requestBody = JSON.stringify(req.body);
      const decryptedSecretKey = business.decryptSecretKey(business.secretKey);
      const expectedSignature = crypto
        .createHmac('sha256', decryptedSecretKey)
        .update(`${requestBody}${timestamp}`)
        .digest('hex');

      if (signature !== expectedSignature) {
        return next(new AppError('Invalid signature', 401));
      }
    } else {
      // If not GET, but no body, still require signature of empty body
      const decryptedSecretKey = business.decryptSecretKey(business.secretKey);
      const expectedSignature = crypto
        .createHmac('sha256', decryptedSecretKey)
        .update(`{}${timestamp}`)
        .digest('hex');

      if (signature !== expectedSignature) {
        return next(new AppError('Invalid signature', 401));
      }
    }
  }

  // 5) Attach business to request object
  req.business = business;
  next();
});
