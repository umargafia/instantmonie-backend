import express, { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import mongoSanitize from 'express-mongo-sanitize';
import xss from 'xss-clean';
import hpp from 'hpp';
import cors from 'cors';
import cookieParser from 'cookie-parser';

import { env } from './config/env';
import userRouter from './routes/user.routes';
import { errorHandler } from './middleware/errorHandler';
import businessRouter from './routes/bussiness.routes';
import accountNumberRouter from './routes/accountNumber.routes';
import paymentRouter from './routes/payment.routes';
import transactionRouter from './routes/transaction.routes';
import logRouter from './routes/log.routes';
import apiRouter from './api/routes/api.routes';
import { requestLogger, securityLogger, logError } from './utils/logger';
import { logLoginAttempts, blockSuspiciousActivity } from './middleware/security.middleware';
import webhookRouter from './routes/webhook.routes';
import kycRouter from './routes/kyc.routes';
import uploadRoutes from './routes/upload.routes';
import otpRoutes from './routes/otp.routes';
import adminRouter from './admin/routes/index.routes';

const app = express();

// Trust proxy - Add this line before any middleware
app.set('trust proxy', 1);

// 1) GLOBAL MIDDLEWARES
// Set security HTTP headers
app.use(helmet());

// Enable CORS
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or Postman)
      if (!origin) return callback(null, true);

      if (env.NODE_ENV === 'development') {
        // In development, allow localhost and your frontend
        const allowedOrigins = [
          'http://localhost:3000',
          'http://localhost:3001',
          'http://127.0.0.1:3000',
          'http://localhost:5173',
          'http://127.0.0.1:5173',
        ];
        if (allowedOrigins.includes(origin)) {
          return callback(null, true);
        }
      } else {
        // In production, allow your frontend and any business domains
        const allowedFrontendUrls = [
          'https://gafiapay.gafiatechnologies.com',
          'https://gafiapay.com',
        ].filter(Boolean); // Remove undefined values

        if (allowedFrontendUrls.includes(origin)) {
          return callback(null, true);
        }
        // For external business APIs, we'll allow all origins but rely on API key authentication
        // This is safe because your API routes are protected by API keys and signatures
        return callback(null, true);
      }

      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'x-api-key',
      'x-signature',
      'x-timestamp',
    ],
  })
);

// Cookie parser middleware
app.use(cookieParser());

// Development logging with Morgan
if (env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Application request logger - logs all requests to database
app.use(requestLogger);

// Apply login attempt logging middleware
app.use(logLoginAttempts);

// Limit requests from same API
const limiter = rateLimit({
  max: 100,
  windowMs: 60 * 60 * 1000,
  message: 'Too many requests from this IP, please try again in an hour!',
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next, options) => {
    securityLogger.warn(`Rate limit exceeded`, {
      action: 'RATE_LIMIT_EXCEEDED',
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      route: req.originalUrl,
      method: req.method,
    });
    res.status(options.statusCode).json({
      status: 'error',
      message: options.message,
    });
  },
});
app.use('/api', limiter);

// Body parser, reading data from body into req.body
app.use(express.json({ limit: '10kb' }));

// Data sanitization against NoSQL query injection
app.use(mongoSanitize());

// Data sanitization against XSS
app.use(xss());

// Prevent parameter pollution
app.use(
  hpp({
    whitelist: [],
  })
);

// Block suspicious activity middleware
app.use('/api/v1/users/login', blockSuspiciousActivity);

// Serving static files
app.use(express.static(`${__dirname}/public`));

// Test middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  req.requestTime = new Date().toISOString();
  next();
});

// 3) ROUTES
app.use('/api/v1/users', userRouter);
app.use('/api/v1/business', businessRouter);
app.use('/api/v1/account-number', accountNumberRouter);
app.use('/api/v1/payment', paymentRouter);
app.use('/api/v1/transaction', transactionRouter);
app.use('/api/v1/logs', logRouter);
app.use('/api/v1/external', apiRouter);
app.use('/api/v1/webhook', webhookRouter);
app.use('/api/v1/kyc', kycRouter);
app.use('/api/v1/upload', uploadRoutes);
app.use('/api/v1/otp', otpRoutes);
app.use('/api/v1/admin', adminRouter);

// 4) ERROR HANDLING
app.all('*', (req: Request, res: Response, next: NextFunction) => {
  const err = new Error(`Can't find ${req.originalUrl} on this server!`);
  logError(err, req);
  next(err);
});

// Custom error handler middleware
const loggingErrorHandler: ErrorRequestHandler = (err, req, res, next) => {
  // Log error
  logError(err, req);

  // Pass to the default error handler
  errorHandler(err, req, res, next);
};

app.use(loggingErrorHandler);

export default app;
