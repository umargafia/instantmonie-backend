import { NextFunction, Request, Response } from 'express';
import { User } from '../models/user.model';
import { catchAsync } from '../utils/catchAsync';
import { AppError } from '../utils/AppError';
import crypto from 'crypto';
import { sendEmail } from '../utils/email';
import { getOTPEmailTemplate } from '../templates/otpEmail';

const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

const OTP_EXPIRY_MINUTES = 10;
const MAX_OTP_ATTEMPTS = 3;
const OTP_LOCK_DURATION_MINUTES = 30;

export const sendOTP = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  const { email, phone, type } = req.body;

  if (!email && !phone) {
    return new AppError('Please provide either email or phone number', 400);
  }

  if (!type || !['forgot-password', 'verify-email', 'withdrawal'].includes(type)) {
    return new AppError('Invalid OTP type', 400);
  }

  const user = await User.findOne({ $or: [{ email }, { phone }] });

  if (!user) {
    return new AppError(
      `if your ${email ? 'email' : 'phone number'} is in our system, you will receive an email with your OTP`,
      400
    );
  }

  // Check if OTP is locked
  if (user.otp.locked && user.otp.lockedUntil > new Date()) {
    return new AppError(
      `OTP is locked. Please try again after ${Math.ceil(
        (user.otp.lockedUntil.getTime() - Date.now()) / (1000 * 60)
      )} minutes`,
      429
    );
  }

  // Generate new OTP
  const otp = generateOTP();
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  // Update user's OTP details
  user.otp = {
    code: otp,
    expiresAt,
    attempts: 0,
    lastAttempt: new Date(),
    lockedUntil: new Date(),
    locked: false,
    lockedReason: '',
    type,
  };

  await user.save({ validateBeforeSave: false });

  // Send OTP via email or SMS
  if (email) {
    await sendEmail({
      email: user.email,
      subject: 'Your Verification Code',
      message: `Your OTP code is ${otp}. It will expire in ${OTP_EXPIRY_MINUTES} minutes.`,
      html: getOTPEmailTemplate({
        otp,
        expiryMinutes: OTP_EXPIRY_MINUTES,
        type,
        firstName: user.name.split(' ')[0],
      }),
    });
  }

  // if (phone) {
  //   await sendSMS({
  //     phone: user.phone,
  //     message: `Your OTP code is ${otp}. It will expire in ${OTP_EXPIRY_MINUTES} minutes.`,
  //   });
  // }

  res.status(200).json({
    status: 'success',
    message: 'OTP sent successfully',
  });
});

export const verifyOTP = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  const { email, phone, otp, type } = req.body;

  if (!email && !phone) {
    return next(new AppError('Please provide either email or phone number', 400));
  }

  if (!otp) {
    return next(new AppError('Please provide OTP', 400));
  }

  if (!type || !['forgot-password', 'verify-email', 'withdrawal'].includes(type)) {
    return next(new AppError('Invalid OTP type', 400));
  }

  const user = await User.findOne({ $or: [{ email }, { phone }] });

  if (!user) {
    return next(new AppError('No user found with this email or phone number', 404));
  }

  // Check if OTP is locked
  if (user.otp.locked && user.otp.lockedUntil > new Date()) {
    return next(
      new AppError(
        `OTP is locked. Please try again after ${Math.ceil(
          (user.otp.lockedUntil.getTime() - Date.now()) / (1000 * 60)
        )} minutes`,
        429
      )
    );
  }

  // Check if OTP has expired
  if (user.otp.expiresAt < new Date()) {
    return next(new AppError('OTP has expired', 400));
  }

  // Check if OTP type matches
  if (user.otp.type !== type) {
    return next(new AppError('Invalid OTP type', 400));
  }

  // Check if OTP matches
  if (user.otp.code !== otp) {
    user.otp.attempts += 1;
    user.otp.lastAttempt = new Date();

    // Lock OTP if max attempts reached
    if (user.otp.attempts >= MAX_OTP_ATTEMPTS) {
      user.otp.locked = true;
      user.otp.lockedUntil = new Date(Date.now() + OTP_LOCK_DURATION_MINUTES * 60 * 1000);
      user.otp.lockedReason = 'Maximum attempts exceeded';
    }

    await user.save({ validateBeforeSave: false });

    return next(new AppError('Invalid OTP', 400));
  }

  // Reset OTP details after successful verification
  user.otp = {
    code: '',
    expiresAt: new Date(),
    attempts: 0,
    lastAttempt: new Date(),
    lockedUntil: new Date(),
    locked: false,
    lockedReason: '',
    type: '',
  };

  await user.save({ validateBeforeSave: false });

  res.status(200).json({
    status: 'success',
    message: 'OTP verified successfully',
  });
});
