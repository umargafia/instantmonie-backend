import { Request, Response, NextFunction } from 'express';
import axios, { AxiosError } from 'axios';
import crypto from 'crypto';
import { Types } from 'mongoose';

import { catchAsync } from '@/utils/catchAsync';
import { AppError } from '@/utils/AppError';
import AccountNumber from '@/models/accountnumber.model';
import { Business } from '@/models/bussiness.model';
import { env } from '@/config/env';
import generateSign from '@/utils/signatureUtil';

interface PopulatedBusiness {
  _id: Types.ObjectId;
  name: string;
  user: {
    _id: Types.ObjectId;
    name: string;
    email: string;
  };
}

export const generateAccountNumber = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const MERCHANT_PRIVATE_KEY = env.PALMPAY_MERCHANT_PRIVATE_KEY;
    const APP_ID = env.PALMPAY_APP_ID;
    const COUNTRY_CODE = env.PALMPAY_COUNTRY_CODE;
    const nonceStr = crypto.randomBytes(16).toString('hex');
    const { name, email, businessId } = req.body;

    const requiredFields = ['name', 'email', 'businessId'];

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
      customerName: business?.name,
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
        const existingAccount = await AccountNumber.findOne({ email });
        if (existingAccount) {
          existingAccount.accountNumber = responseData?.virtualAccountNo;
          existingAccount.accountName = responseData?.virtualAccountName;
          existingAccount.userName = responseData?.virtualAccountName;
          await existingAccount.save();
          accountNumber = existingAccount;
        } else {
          accountNumber = await AccountNumber.create({
            businessId: business._id,
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

export const getAccountNumbers = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;
    const businessId = req.params.id;

    if (!businessId) {
      return next(new AppError('Business ID is required', 400));
    }

    const business = await Business.findOne({ _id: businessId });

    if (!business) {
      return next(new AppError('Business not found', 404));
    }

    // Check if business belongs to user
    if (business.user.toString() !== req.user._id.toString()) {
      return next(new AppError('You are not authorized to access this business', 403));
    }

    const [accountNumbers, total] = await Promise.all([
      AccountNumber.find({ businessId: businessId })
        .select('-bvn -nin -licenseNumber')
        .sort('-createdAt')
        .skip(skip)
        .limit(limit),
      AccountNumber.countDocuments({ businessId: businessId }),
    ]);

    res.status(200).json({
      status: 'success',
      results: accountNumbers.length,
      total,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        limit,
      },
      data: accountNumbers,
    });
  }
);

export const getAccountNumberById = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const accountNumber = await AccountNumber.findOne({
      _id: req.params.id,
    }).populate<{ businessId: PopulatedBusiness }>({
      path: 'businessId',
      select: 'name user',
      populate: {
        path: 'user',
        select: 'name email username',
      },
    });

    if (!accountNumber) {
      return next(new AppError('Account number not found', 404));
    }

    // Check if business belongs to user
    if (accountNumber.businessId.user._id.toString() !== req.user._id.toString()) {
      return next(new AppError('You are not authorized to access this account number', 403));
    }

    res.status(200).json({
      status: 'success',
      data: accountNumber,
    });
  }
);

export const validateAccountNumber = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { accountNumber, bankName } = req.body;

    if (!accountNumber || !bankName) {
      return next(new AppError('Please provide account number and bank name', 400));
    }

    const account = await AccountNumber.findOne({
      accountNumber,
      bankName,
      businessId: req.user.businessId,
    }).select('accountName accountNumber bankName');

    if (!account) {
      return next(new AppError('Account number not found or invalid', 404));
    }

    res.status(200).json({
      status: 'success',
      data: {
        isValid: true,
        accountDetails: {
          accountName: account.accountName,
          accountNumber: account.accountNumber,
          bankName: account.bankName,
        },
      },
    });
  }
);

export const searchAccountNumbers = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { query, page = 1, limit = 10 } = req.query;
      const businessId = req.user?.businessId;

      if (!businessId) {
        return res.status(400).json({
          status: 'error',
          message: 'Business ID is required',
        });
      }

      if (!query) {
        return res.status(400).json({
          status: 'error',
          message: 'Search query is required',
        });
      }

      const skip = (Number(page) - 1) * Number(limit);

      const accountNumbers = await AccountNumber.find({
        businessId,
        $or: [
          { accountName: { $regex: query, $options: 'i' } },
          { email: { $regex: query, $options: 'i' } },
          { accountNumber: { $regex: query, $options: 'i' } },
          { bankName: { $regex: query, $options: 'i' } },
        ],
      })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit));

      const total = await AccountNumber.countDocuments({
        businessId,
        $or: [
          { accountName: { $regex: query, $options: 'i' } },
          { email: { $regex: query, $options: 'i' } },
          { accountNumber: { $regex: query, $options: 'i' } },
          { bankName: { $regex: query, $options: 'i' } },
        ],
      });

      res.status(200).json({
        status: 'success',
        data: {
          accountNumbers,
          pagination: {
            currentPage: Number(page),
            totalPages: Math.ceil(total / Number(limit)),
            totalResults: total,
          },
        },
      });
    } catch (error) {
      console.error('Error searching account numbers:', error);
      res.status(500).json({
        status: 'error',
        message: 'An error occurred while searching account numbers',
      });
    }
  }
);
