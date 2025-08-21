import { Request, Response, NextFunction } from 'express';
import { User } from '../models/user.model';
import { AuthService } from '../services/authService';
import { AppError } from '../utils/AppError';
import { catchAsync } from '../utils/catchAsync';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { Business } from '@/models/bussiness.model';
import { Transaction } from '@/models/transaction.model';
import encryptKey from '@/utils/encryptKey';
import { securityLogger } from '../utils/logger';
import { SecurityAction } from '../models/log.model';
import validator from 'validator';
import { sendEmail } from '../utils/email';
import { getWelcomeEmailTemplate } from '../templates/welcomeEmail';

export const signup = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  const { firstName, lastName, email, password, passwordConfirm, username, phone } = req.body;

  if (!firstName || !lastName || !email || !password || !passwordConfirm || !username || !phone) {
    return next(new AppError('Please provide all fields', 400));
  }

  const name = `${firstName} ${lastName}`;

  const userNameExists = await User.findOne({ username });
  if (userNameExists) {
    return next(new AppError('Username already exists', 400));
  }

  const emailExists = await User.findOne({ email });
  if (emailExists) {
    return next(new AppError('Email already exists', 400));
  }

  const phoneExists = await User.findOne({ phone });
  if (phoneExists) {
    return next(new AppError('Phone number already exists', 400));
  }

  try {
    const newUser = await User.create({
      name,
      email,
      password,
      passwordConfirm,
      username,
      phone,
      lastLoginIP: req.ip || req.headers['x-forwarded-for'] || 'unknown',
      lastLoginDate: new Date(),
    });

    // New users don't have a business yet, so pass null as businessId
    AuthService.createSendToken(newUser, 201, req, res, null);
  } catch (error) {
    if (error instanceof mongoose.Error.ValidationError) {
      return next(new AppError(error.message, 400));
    }
    next(error);
  }
});

export const login = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  const { identifier, password } = req.body;

  // Get client information for security logging
  const ipRaw = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  const clientIp = Array.isArray(ipRaw) ? ipRaw[0] : String(ipRaw);
  const userAgent = req.headers['user-agent'] || 'unknown';

  // 1) Check if identifier and password exist
  if (!identifier || !password) {
    securityLogger.warn(`Login attempt missing required fields`, {
      action: SecurityAction.LOGIN_FAILURE,
      reason: 'MISSING_FIELDS',
      ip: clientIp,
      userAgent,
      fields: !identifier ? 'identifier' : 'password',
    });

    return next(new AppError('Please provide email/username and password', 400));
  }

  // 2) Determine if identifier is email or username
  let identifierType = 'email';

  if (!validator.isEmail(identifier)) {
    identifierType = 'username';
  }

  // 3) Add a small delay to prevent timing attacks (varies between 100-300ms)
  await new Promise((resolve) => setTimeout(resolve, 100 + Math.random() * 200));

  // 4) Check if user exists
  const user = await User.findOne({ [identifierType]: identifier }).select('+password');

  // 5) If user doesn't exist or password is incorrect, return generic error
  if (!user) {
    // Log failed login attempt but don't reveal whether user exists
    securityLogger.warn(`Failed login attempt: user not found`, {
      action: SecurityAction.LOGIN_FAILURE,
      reason: 'USER_NOT_FOUND',
      identifier,
      identifierType,
      ip: clientIp,
      userAgent,
    });

    // Use generic error message that doesn't reveal if user exists
    return next(new AppError(`Invalid credentials`, 401));
  }

  if (user?.disabled) {
    return next(new AppError('Account is disabled, please contact support', 401));
  }

  // 6) Check if account is locked due to too many failed attempts
  if (user.loginAttempts >= 5 && user.lockUntil && user.lockUntil.getTime() > Date.now()) {
    securityLogger.warn(`Login attempt on locked account`, {
      action: SecurityAction.LOGIN_ATTEMPT_LOCKED,
      userId: user._id.toString(),
      identifier,
      identifierType,
      ip: clientIp,
      userAgent,
    });

    return next(
      new AppError(
        'Account is temporarily locked due to too many failed login attempts. Please try again later.',
        401
      )
    );
  }

  // 7) Verify password
  const isPasswordCorrect = await user.correctPassword(password, user.password);

  if (!isPasswordCorrect) {
    // Increment login attempts and possibly lock account
    user.loginAttempts = (user.loginAttempts || 0) + 1;

    // Lock account after 5 failed attempts
    if (user.loginAttempts >= 5) {
      // Lock for 30 minutes
      user.lockUntil = new Date(Date.now() + 30 * 60 * 1000);

      securityLogger.warn(`Account locked after multiple failed attempts`, {
        action: SecurityAction.ACCOUNT_LOCKED,
        userId: user._id.toString(),
        identifier,
        identifierType,
        ip: clientIp,
        userAgent,
        attempts: user.loginAttempts,
      });
    }

    await user.save({ validateBeforeSave: false });

    securityLogger.warn(`Failed login attempt: incorrect password`, {
      action: SecurityAction.LOGIN_FAILURE,
      reason: 'INVALID_PASSWORD',
      userId: user._id.toString(),
      identifier,
      identifierType,
      ip: clientIp,
      userAgent,
      attempts: user.loginAttempts,
    });

    // Use generic error message that doesn't reveal specific issue
    return next(new AppError(`Invalid credentials`, 401));
  }

  // 8) If password is correct, reset login attempts and lock
  user.loginAttempts = 0;
  user.lockUntil = undefined;
  await user.save({ validateBeforeSave: false });

  // Check for suspicious login patterns
  let isSuspiciousLogin = false;
  const lastLoginIP = user.lastLoginIP;

  // Flag as suspicious if IP has changed significantly (this is a simple check, could be more sophisticated)
  if (lastLoginIP && lastLoginIP !== clientIp) {
    isSuspiciousLogin = true;
  }

  // Update last login information
  user.lastLoginIP = clientIp;
  user.lastLoginDate = new Date();
  await user.save({ validateBeforeSave: false });

  // Log suspicious login (but still allow it)
  if (isSuspiciousLogin) {
    securityLogger.warn(`Suspicious login detected from new IP`, {
      action: SecurityAction.SUSPICIOUS_LOGIN,
      userId: user._id.toString(),
      identifier,
      identifierType,
      ip: clientIp,
      previousIP: lastLoginIP,
      userAgent,
    });

    // Here we could send an alert email to the user
    // await sendSecurityAlert(user.email, 'New login from unfamiliar location', { ip: clientIp, time: new Date() });
  }

  // 9) Find relevant business ID
  let businessId = null;

  // Check if user has a business ID set
  if (user.businessId) {
    businessId = user.businessId;
  } else {
    // Find the business owned by the user
    const ownedBusiness = await Business.findOne({ user: user._id }).sort({ createdAt: -1 });

    if (ownedBusiness) {
      businessId = ownedBusiness._id;

      // Update user's businessId field
      user.businessId = businessId;
      await user.save({ validateBeforeSave: false });
    } else {
      // If user doesn't own a business, check for last interacted business
      const lastTransaction = await Transaction.findOne({ user: user._id })
        .sort({ createdAt: -1 })
        .select('business');

      if (lastTransaction) {
        businessId = lastTransaction.business;

        // Update user's businessId field
        user.businessId = businessId;
        await user.save({ validateBeforeSave: false });
      }
    }
  }

  // 10) Log successful login
  securityLogger.info(`User logged in successfully`, {
    action: SecurityAction.LOGIN_SUCCESS,
    userId: user._id.toString(),
    identifier,
    identifierType,
    ip: clientIp,
    userAgent,
    businessId: businessId ? businessId.toString() : null,
  });

  // After successful login and before sending token
  if (!user.welcomeEmailSent) {
    try {
      // Send welcome email
      await sendEmail({
        email: user.email,
        subject: 'Welcome to GafiaPay!',
        message: `Welcome to GafiaPay, ${user.name.split(' ')[0]}! We're excited to have you on board.`,
        html: getWelcomeEmailTemplate({
          firstName: user.name.split(' ')[0],
          dashboardUrl: `${process.env.FRONTEND_URL}/app/businesses`,
        }),
      });

      // Update user's welcomeEmailSent status
      user.welcomeEmailSent = true;
      await user.save({ validateBeforeSave: false });

      securityLogger.info(`Welcome email sent to user`, {
        action: SecurityAction.EMAIL_SENT,
        userId: user._id.toString(),
        emailType: 'WELCOME',
      });
    } catch (error) {
      // Log the error but don't fail the login
      securityLogger.error(`Failed to send welcome email`, {
        action: SecurityAction.EMAIL_ERROR,
        userId: user._id.toString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // 11) Create JWT token
  const token = AuthService.signToken(user._id.toString());

  // 12) Send token to client with enhanced response including businessId
  AuthService.createSendToken(user, 200, req, res, businessId ? businessId.toString() : null);
});

export const protect = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  // 1) Getting token and check if it exists
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return next(new AppError('You are not logged in! Please log in to get access.', 401));
  }

  // 1) Verify JWT token
  const decoded = await AuthService.verifyToken(token);

  // 2) Check if user exists
  const currentUser = await User.findById(decoded.id);
  if (!currentUser) {
    return next(new AppError('The user belonging to this token no longer exists.', 401));
  }

  if (currentUser?.disabled) {
    securityLogger.warn(`User attempted to access disabled account`, {
      action: SecurityAction.ACCOUNT_DISABLED,
      userId: currentUser._id.toString(),
      ip: req.ip || req.headers['x-forwarded-for'] || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
    });
    return next(new AppError('Account is disabled, please contact support', 401));
  }

  // 3) Check if user changed password after token was issued
  if (currentUser.changedPasswordAfter(decoded.iat)) {
    return next(new AppError('User recently changed password! Please log in again.', 401));
  }

  req.user = currentUser;
  next();
});

export const restrictTo = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    // roles is an array ['admin', 'lead-guide']
    if (!roles.includes(req.user.role)) {
      return next(new AppError('You do not have permission to perform this action', 403));
    }
    next();
  };
};

export const forgotPassword = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    // 1) Get user based on POSTed email
    const user = await User.findOne({ email: req.body.email });
    if (!user) {
      return next(new AppError('There is no user with that email address.', 404));
    }

    // 2) Generate the random reset token
    const resetToken = user.createPasswordResetToken();
    await user.save({ validateBeforeSave: false });

    // 3) Send it to user's email
    const resetURL = `${req.protocol}://${req.get(
      'host'
    )}/api/v1/users/resetPassword/${resetToken}`;
    const message = `Forgot your password? Submit a PATCH request with your new password to: ${resetURL}.\nIf you didn't forget your password, please ignore this email!`;

    try {
      // TODO: Implement email sending functionality
      await sendEmail({
        email: user.email,
        subject: 'Your Password Reset Token (valid for 10 min)',
        message,
      });

      res.status(200).json({
        status: 'success',
        message: 'Token sent to email!',
      });
    } catch (err) {
      user.passwordResetToken = undefined;
      user.passwordResetExpires = undefined;
      await user.save({ validateBeforeSave: false });

      return next(new AppError('There was an error sending the email. Try again later!', 500));
    }
  }
);

export const resetPassword = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  // 1) Get user based on the token
  const hashedToken = crypto.createHash('sha256').update(req.params.token).digest('hex');

  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: Date.now() },
  });

  // 2) If token has not expired, and there is user, set the new password
  if (!user) {
    return next(new AppError('Token is invalid or has expired', 400));
  }

  // 3) Update password
  user.password = req.body.password;
  user.passwordConfirm = req.body.passwordConfirm;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  await user.save();

  // 4) Log the user in, send JWT
  AuthService.createSendToken(user, 200, req, res);
});

export const updatePassword = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    // 1) Get user from collection
    const user = await User.findById(req.user.id).select('+password');
    if (!user) {
      return next(new AppError('User not found', 404));
    }

    // 2) Check if POSTed current password is correct
    if (!(await user.correctPassword(req.body.currentPassword, user.password))) {
      return next(new AppError('Your current password is wrong.', 401));
    }

    // 3) If so, update password
    user.password = req.body.password;
    user.passwordConfirm = req.body.passwordConfirm;
    await user.save();

    // 4) Log user in, send JWT
    AuthService.createSendToken(user, 200, req, res);
  }
);

export const logout = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  // Clear JWT cookie and end session
  await AuthService.clearAuthCookie(req, res);

  // Log logout event
  securityLogger.info(`User logged out`, {
    action: SecurityAction.USER_LOGOUT,
    userId: req.user?._id?.toString() || 'unknown',
    ip: req.ip || req.headers['x-forwarded-for'] || 'unknown',
    userAgent: req.headers['user-agent'] || 'unknown',
  });

  res.status(200).json({ status: 'success' });
});

export const terminateSession = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.params.userId || req.user._id;

    // Check permissions - only admin can terminate others' sessions
    if (req.params.userId && req.user.role !== 'admin') {
      return next(
        new AppError("You do not have permission to terminate other users' sessions", 403)
      );
    }

    // Find user and clear session
    const user = await User.findById(userId);

    if (!user) {
      return next(new AppError('User not found', 404));
    }

    if (!user.activeSession) {
      return next(new AppError('No active session found for this user', 400));
    }

    // Log the action
    securityLogger.info(`User session terminated by ${req.params.userId ? 'admin' : 'user'}`, {
      action: SecurityAction.SESSION_INVALIDATED,
      userId: user._id.toString(),
      adminId: req.params.userId ? req.user._id.toString() : undefined,
      ip: req.ip || req.headers['x-forwarded-for'] || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
    });

    // Clear the session
    user.activeSession = undefined;
    await user.save({ validateBeforeSave: false });

    res.status(200).json({
      status: 'success',
      message: 'Session terminated successfully',
    });
  }
);

export const getActiveSessions = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    // For admin, allow viewing all active sessions
    let query = {};

    if (req.user.role !== 'admin') {
      // Regular users can only see their own session
      query = { _id: req.user._id };
    } else if (req.query.userId) {
      // Admin can filter by userId
      query = { _id: req.query.userId };
    }

    // Find users with active sessions
    const users = await User.find({
      ...query,
      activeSession: { $exists: true, $ne: null },
    }).select('name username email activeSession');

    // Format the response to not include the token
    const sessions = users.map((user) => {
      const session = user.toObject();

      // Don't expose the actual token
      if (session.activeSession && session.activeSession.token) {
        session.activeSession.token = 'REDACTED';
      }

      return session;
    });

    res.status(200).json({
      status: 'success',
      results: sessions.length,
      data: { sessions },
    });
  }
);
