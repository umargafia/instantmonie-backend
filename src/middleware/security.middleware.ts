import { Request, Response, NextFunction } from 'express';
import { securityLogger } from '../utils/logger';
import { Log, LogType, LogSeverity, SecurityAction } from '../models/log.model';
import { AppError } from '../utils/AppError';

/**
 * Middleware to log login attempts
 */
export const logLoginAttempts = (req: Request, res: Response, next: NextFunction) => {
  // Store original response send method
  const originalSend = res.send;

  // Get client IP and user agent
  const clientIp = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  const userAgent = req.headers['user-agent'] || 'unknown';

  // Path info
  const path = req.path;
  const method = req.method;

  // Override send method to log the response
  res.send = function (body: any): Response {
    // Convert body to string if it's not
    const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);

    // Determine if login was successful or not based on response
    try {
      const parsedBody = JSON.parse(bodyStr);
      const statusCode = res.statusCode;

      // If this is a login attempt
      if (path.includes('/login') && method === 'POST') {
        const wasSuccessful =
          statusCode >= 200 && statusCode < 300 && parsedBody.status === 'success';

        if (wasSuccessful) {
          // Log successful login but don't log the token
          securityLogger.info('Login successful', {
            action: SecurityAction.LOGIN_SUCCESS,
            userId: parsedBody.data?._id || 'unknown',
            ip: clientIp,
            userAgent,
            method,
            path,
          });
        } else {
          // Log failed login
          securityLogger.warn('Login failed', {
            action: SecurityAction.LOGIN_FAILURE,
            reason: parsedBody.message || 'Unknown error',
            ip: clientIp,
            userAgent,
            method,
            path,
            statusCode,
          });
        }
      }
    } catch (error) {
      // If we can't parse the body, just log that there was a response
      securityLogger.info(`Response sent on ${path}`, {
        statusCode: res.statusCode,
        ip: clientIp,
        userAgent,
        method,
        path,
      });
    }

    // Call the original send method
    return originalSend.call(this, body);
  };

  next();
};

/**
 * Middleware to detect and block suspicious activity
 */
export const blockSuspiciousActivity = async (req: Request, res: Response, next: NextFunction) => {
  const clientIp = req.ip || req.headers['x-forwarded-for'] || 'unknown';

  // Check for too many requests from this IP in the last 5 minutes
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

  const recentFailedLogins = await Log.countDocuments({
    type: LogType.SECURITY,
    action: SecurityAction.LOGIN_FAILURE,
    ip: clientIp,
    timestamp: { $gte: fiveMinutesAgo },
  });

  // If more than 5 failed logins in 5 minutes, block for suspicious activity
  if (recentFailedLogins > 5) {
    securityLogger.warn('Blocking suspicious activity', {
      action: 'SUSPICIOUS_ACTIVITY_BLOCKED',
      ip: clientIp,
      userAgent: req.headers['user-agent'],
      method: req.method,
      path: req.path,
      failedAttempts: recentFailedLogins,
    });

    return next(new AppError('Too many failed login attempts. Please try again later.', 429));
  }

  next();
};

/**
 * Simple CSRF protection middleware
 * This is a basic implementation - for production,
 * consider using a library like csurf
 */
export const csrfProtection = (req: Request, res: Response, next: NextFunction) => {
  // Skip for non-mutation operations
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // Skip for API calls that use API key authentication
  if (req.headers['x-api-key']) {
    return next();
  }

  // Check the CSRF token
  const csrfTokenHeader = req.headers['x-csrf-token'];
  const csrfTokenCookie = req.cookies && req.cookies['csrf-token'];

  if (!csrfTokenHeader || !csrfTokenCookie || csrfTokenHeader !== csrfTokenCookie) {
    securityLogger.warn('CSRF token validation failed', {
      action: 'CSRF_VALIDATION_FAILED',
      ip: req.ip || req.headers['x-forwarded-for'] || 'unknown',
      userAgent: req.headers['user-agent'],
      method: req.method,
      path: req.path,
    });

    return next(new AppError('Invalid CSRF token', 403));
  }

  next();
};
