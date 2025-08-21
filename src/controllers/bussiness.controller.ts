import { Business } from '@/models/bussiness.model';
import { AppError } from '@/utils/AppError';
import { catchAsync } from '@/utils/catchAsync';
import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

/**
 * Generates secure API keys for business authentication
 * @returns Object containing apiKey and secretKey
 */
function generateKeys() {
  // Generate a random 32-byte API key
  const apiKey = crypto.randomBytes(32).toString('hex');

  // Generate a random 64-byte secret key for stronger security
  const secretKey = crypto.randomBytes(64).toString('hex');

  // Generate a random 32-byte public key

  return { apiKey, secretKey };
}

export const createBusiness = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { name, description, licenseNumber } = req.body;
    const user = req.user;

    if (!name) {
      return next(new AppError('Name is required', 400));
    }

    const businessNameExists = await Business.findOne({ name });
    if (businessNameExists) {
      return next(new AppError('Business name already exists', 400));
    }

    const { apiKey, secretKey } = generateKeys();

    //encrypt the secret key

    if (licenseNumber) {
      //check if the license number is valid
      const licenseNumberRegex = /^[A-Z]{2}\d{7}$/;
      if (!licenseNumberRegex.test(licenseNumber)) {
        return next(new AppError('Invalid license number', 400));
      }
    }

    const business = await Business.create({
      name,
      description,
      apiKey,
      secretKey,
      user: user._id,
      licenseNumber,
    });

    res.status(201).json({
      status: 'success',
      data: {
        _id: business._id,
        name: business.name,
        description: business.description,
        apiKey: business.apiKey,
        secretKey: business.decryptSecretKey(business.secretKey),
      },
    });
  }
);

export const getBusiness = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const skip = (page - 1) * limit;
  const user = req.user;

  const [businesses, total] = await Promise.all([
    Business.find({ user: user._id }).limit(limit).skip(skip).select('-secretKey -apiKey'),
    Business.countDocuments({ user: user._id }),
  ]);

  res.status(200).json({
    status: 'success',
    results: businesses.length,
    total,
    pagination: {
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      limit,
    },
    data: businesses,
  });
});

export const getBusinessById = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const business = await Business.findById(req.params.id).select('-secretKey');
    if (!business) {
      return next(new AppError('Business not found', 404));
    }

    if (business.user.toString() !== req.user._id.toString()) {
      return next(new AppError('You are not authorized to view this business', 403));
    }

    //set the business in to the user
    req.user.businessId = business._id;
    await req.user.save({ validateBeforeSave: false });

    res.status(200).json({
      status: 'success',
      data: business,
    });
  }
);

export const updateBusiness = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const business = await Business.findById(req.params.id);
    if (!business) {
      return next(new AppError('Business not found', 404));
    }

    if (business.user.toString() !== req.user._id.toString()) {
      return next(new AppError('You are not authorized to update this business', 403));
    }

    const newBusiness = await Business.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    res.status(200).json({
      status: 'success',
      data: newBusiness,
    });
  }
);

export const resetKeys = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  const business = await Business.findById(req.params.id).select('+secretKey');
  const key = req.query.key;

  if (!business) {
    return next(new AppError('Business not found', 404));
  }

  if (business.user.toString() !== req.user._id.toString()) {
    return next(new AppError('You are not authorized to reset the keys', 403));
  }

  let secretKey;
  if (key) {
    if (key === 'apiKey') {
      const { apiKey } = generateKeys();
      business.apiKey = apiKey;
    } else if (key === 'secretKey') {
      const { secretKey } = generateKeys();
      business.secretKey = secretKey;
    }
  } else if (key === 'both') {
    const { apiKey, secretKey: newSecretKey } = generateKeys();
    business.apiKey = apiKey;
    business.secretKey = newSecretKey;
    secretKey = newSecretKey;
  } else {
    return next(new AppError('Invalid key', 400));
  }

  await business.save();
  business.apiKey = business.apiKey;
  business.secretKey = business.decryptSecretKey(business.secretKey);

  res.status(200).json({
    status: 'success',
    data: business,
  });
});

export const saveBussinessAccountDetails = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { businessId, accountNumber, accountName, bankCode, bankName, bankLogo } = req.body;

  const business = await Business.findById(businessId);
  if (!business) {
    return next(new AppError('Business not found', 404));
  }

  business.accountDetails.accountNumber = accountNumber;
  business.accountDetails.accountName = accountName;
  business.accountDetails.bankCode = bankCode;
  business.accountDetails.bankName = bankName;
  business.accountDetails.bankLogo = bankLogo;
  await business.save();

  res.status(200).json({
    status: 'success',
    data: business,
  });
};
