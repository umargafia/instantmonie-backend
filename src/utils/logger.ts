import winston from 'winston';
import { env } from '../config/env';
import { Request, Response, NextFunction } from 'express';
import { Log, LogType, LogSeverity, SecurityAction } from '../models/log.model';
import TransportStream from 'winston-transport';

// Define format for logs
const logFormat = winston.format.combine(winston.format.timestamp(), winston.format.json());

// Create a custom MongoDB transport
class MongoDBTransport extends TransportStream {
  private logType: LogType;

  constructor(logType: LogType, options?: TransportStream.TransportStreamOptions) {
    super(options);
    this.logType = logType;
  }

  log(info: any, callback: () => void) {
    setImmediate(() => {
      this.emit('logged', info);
    });

    // Map Winston levels to our severity levels
    const severityMap: Record<string, LogSeverity> = {
      error: LogSeverity.ERROR,
      warn: LogSeverity.WARN,
      info: LogSeverity.INFO,
      debug: LogSeverity.DEBUG,
    };

    const { level, message, ...meta } = info;

    // Extract specific fields from meta
    const logData = {
      type: this.logType,
      severity: severityMap[level] || LogSeverity.INFO,
      message: message || '',
      action: meta?.action,
      userId: meta?.userId,
      ip: meta?.ip,
      userAgent: meta?.userAgent,
      statusCode: meta?.statusCode,
      error: meta?.error || meta?.stack,
      metadata: { ...meta },
    };

    // Remove duplicate fields from metadata
    ['action', 'userId', 'ip', 'userAgent', 'statusCode', 'error', 'stack'].forEach(
      (field) => delete logData.metadata[field]
    );

    // Save to MongoDB without waiting for response
    Log.create(logData).catch((err) => {
      console.error('Failed to save log to database:', err);
    });

    callback();
  }
}

// Create general application logger
export const logger = winston.createLogger({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: logFormat,
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
    }),
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
    new MongoDBTransport(LogType.APPLICATION),
  ],
});

// Create a specialized security logger for auth-related events
export const securityLogger = winston.createLogger({
  level: 'info',
  format: logFormat,
  defaultMeta: { service: 'security' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
    }),
    new winston.transports.File({ filename: 'logs/security.log' }),
    new MongoDBTransport(LogType.SECURITY),
  ],
});

// Create a request logger middleware
export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  // Log request details
  logger.info(`${req.method} ${req.originalUrl}`, {
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  });

  // Store request log in database
  Log.create({
    type: LogType.APPLICATION,
    severity: LogSeverity.INFO,
    message: `${req.method} ${req.originalUrl}`,
    ip: req.ip || req.headers['x-forwarded-for'] || 'unknown',
    userAgent: req.headers['user-agent'],
    route: req.originalUrl,
    method: req.method,
    userId: req.user?._id?.toString(),
  }).catch((err) => {
    console.error('Failed to save request log:', err);
  });

  next();
};

// Export a function to create error logs
export const logError = (error: Error, req?: Request) => {
  const logData: any = {
    message: error.message,
    error: error.stack,
  };

  if (req) {
    Object.assign(logData, {
      ip: req.ip || req.headers['x-forwarded-for'] || 'unknown',
      userAgent: req.headers['user-agent'],
      route: req.originalUrl,
      method: req.method,
      userId: req.user?._id?.toString(),
    });
  }

  logger.error(error.message, logData);

  // Explicitly log to database since this is an important error
  Log.create({
    type: LogType.ERROR,
    severity: LogSeverity.ERROR,
    message: error.message,
    error: error.stack,
    ip: req?.ip,
    userAgent: req?.headers['user-agent'] as string,
    route: req?.originalUrl,
    method: req?.method,
    userId: req?.user?._id?.toString(),
  }).catch((err) => {
    console.error('Failed to save error log:', err);
  });
};

// Export a function to log security events
export const logSecurityEvent = (
  action: SecurityAction,
  message: string,
  data: {
    userId?: string;
    ip?: string;
    userAgent?: string;
    [key: string]: any;
  }
) => {
  securityLogger.info(message, {
    action,
    ...data,
  });
};

export const createLogger = (context: string) => {
  return winston.createLogger({
    level: 'info',
    format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
    defaultMeta: { context },
    transports: [
      new winston.transports.Console({
        format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
      }),
      new winston.transports.File({ filename: 'error.log', level: 'error' }),
      new winston.transports.File({ filename: 'combined.log' }),
    ],
  });
};
