import jwt from 'jsonwebtoken';
import { Request, Response } from 'express';
import { env } from '../config/env';
import { IUser } from '../models/user.model';
import { securityLogger } from '../utils/logger';
import { SecurityAction } from '../models/log.model';
import { User } from '../models/user.model';
import { AppError } from '../utils/AppError';

export class AuthService {
  static signToken(id: string, expiresIn = env.JWT_EXPIRES_IN): string {
    return jwt.sign({ id }, env.JWT_SECRET, {
      expiresIn,
    }) as string;
  }

  /**
   * Creates a new JWT token, terminates any existing sessions, and saves the new session
   */
  static async createSendToken(
    user: IUser,
    statusCode: number,
    req: Request,
    res: Response,
    businessId?: string | null
  ) {
    // Generate token
    const token = this.signToken(user._id.toString());

    // Get client information
    const clientIp = (req.ip ||
      (typeof req.headers['x-forwarded-for'] === 'string'
        ? req.headers['x-forwarded-for']
        : Array.isArray(req.headers['x-forwarded-for'])
          ? req.headers['x-forwarded-for'][0]
          : 'unknown')) as string;
    const userAgent = req.headers['user-agent'] || 'unknown';

    // Check if user has an existing active session
    if (user.activeSession && user.activeSession.token) {
      securityLogger.info(`Existing session found. Terminating previous session.`, {
        action: SecurityAction.EXISTING_SESSION_DETECTED,
        userId: user._id.toString(),
        ip: clientIp,
        userAgent,
        previousSessionDevice: user.activeSession.device,
        previousSessionIp: user.activeSession.ip,
      });
    }

    // Update user with new session information
    user.activeSession = {
      token,
      device: userAgent,
      ip: clientIp,
      lastActive: new Date(),
    };

    await user.save({ validateBeforeSave: false });

    // Set cookie expiry to 90 days by default if not specified in env
    const cookieExpiresIn = env.JWT_COOKIE_EXPIRES_IN
      ? parseInt(env.JWT_COOKIE_EXPIRES_IN) * 24 * 60 * 60 * 1000
      : 90 * 24 * 60 * 60 * 1000;

    // Set secure cookie for production
    const cookieOptions = {
      expires: new Date(Date.now() + cookieExpiresIn),
      httpOnly: true,
      secure: req.secure || req.headers['x-forwarded-proto'] === 'https',
    };

    // Log JWT token creation (without exposing the actual token)
    securityLogger.info(`JWT token created for user`, {
      action: SecurityAction.NEW_SESSION_STARTED,
      userId: user._id.toString(),
      ip: clientIp,
      userAgent,
    });

    // Send JWT as a cookie
    res.cookie('jwt', token, cookieOptions);

    // Remove password from output
    const userWithoutPassword = { ...user.toObject() };
    delete userWithoutPassword.password;
    delete userWithoutPassword.activeSession; // Don't expose session details to client

    res.status(statusCode).json({
      status: 'success',
      token,
      data: {
        ...userWithoutPassword,
        businessId:
          businessId ||
          (userWithoutPassword.businessId ? userWithoutPassword.businessId.toString() : null),
      },
    });
  }

  static async verifyToken(token: string): Promise<{ id: string; iat: number; exp: number }> {
    try {
      const decoded = jwt.verify(token, env.JWT_SECRET) as {
        id: string;
        iat: number;
        exp: number;
      };

      // Fetch the user to verify if this token matches their active session
      const user = await User.findById(decoded.id);
      if (!user) {
        throw new Error('User not found');
      }

      // Check if token matches the active session token
      if (!user.activeSession || user.activeSession.token !== token) {
        securityLogger.warn(`Session invalidated - using outdated token`, {
          action: SecurityAction.SESSION_INVALIDATED,
          userId: user._id.toString(),
          reason: 'TOKEN_MISMATCH',
        });
        throw new Error(
          'Your session has been invalidated due to a new login. Please log in again.'
        );
      }

      // Update last active timestamp
      user.activeSession.lastActive = new Date();
      await user.save({ validateBeforeSave: false });

      return decoded;
    } catch (error) {
      // Log verification failure without exposing sensitive error details
      securityLogger.warn(`JWT verification failed`, {
        action: SecurityAction.TOKEN_VERIFICATION_FAILED,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      // Rethrow with generic message
      if (error instanceof Error && error.name === 'TokenExpiredError') {
        throw new Error('Your token has expired. Please log in again.');
      }

      throw new Error('Invalid token. Please log in again.');
    }
  }

  /**
   * Clears the authentication cookie and terminates the user's session
   */
  static async clearAuthCookie(req: Request, res: Response): Promise<void> {
    // Clear the cookie
    res.cookie('jwt', 'loggedout', {
      expires: new Date(Date.now() + 10 * 1000),
      httpOnly: true,
    });

    // If we have a user in the request, clear their active session
    if (req.user && req.user._id) {
      const user = await User.findById(req.user._id);
      if (user && user.activeSession) {
        securityLogger.info('User session terminated', {
          action: SecurityAction.SESSION_ENDED,
          userId: user._id.toString(),
          ip: req.ip || req.headers['x-forwarded-for'] || 'unknown',
          userAgent: req.headers['user-agent'] || 'unknown',
        });

        // Clear the session
        user.activeSession = undefined;
        await user.save({ validateBeforeSave: false });
      }
    }
  }
}
