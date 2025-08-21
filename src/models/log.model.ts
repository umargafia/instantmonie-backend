import mongoose, { Document, Schema } from 'mongoose';

// Define log types
export enum LogType {
  SECURITY = 'security',
  APPLICATION = 'application',
  USER_ACTIVITY = 'user_activity',
  ERROR = 'error',
}

// Define log severity levels
export enum LogSeverity {
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  DEBUG = 'debug',
}

// Define specific security action types
export enum SecurityAction {
  LOGIN_SUCCESS = 'LOGIN_SUCCESS',
  LOGIN_FAILURE = 'LOGIN_FAILURE',
  ACCOUNT_LOCKED = 'ACCOUNT_LOCKED',
  LOGIN_ATTEMPT_INVALID = 'LOGIN_ATTEMPT_INVALID',
  LOGIN_ATTEMPT_LOCKED = 'LOGIN_ATTEMPT_LOCKED',
  SUSPICIOUS_LOGIN = 'SUSPICIOUS_LOGIN',
  PASSWORD_RESET = 'PASSWORD_RESET',
  PASSWORD_CHANGED = 'PASSWORD_CHANGED',
  API_KEY_USED = 'API_KEY_USED',
  USER_LOGOUT = 'USER_LOGOUT',
  TOKEN_CREATED = 'TOKEN_CREATED',
  TOKEN_VERIFICATION_FAILED = 'TOKEN_VERIFICATION_FAILED',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  SUSPICIOUS_ACTIVITY_BLOCKED = 'SUSPICIOUS_ACTIVITY_BLOCKED',
  CSRF_VALIDATION_FAILED = 'CSRF_VALIDATION_FAILED',
  SESSION_ENDED = 'SESSION_ENDED',
  SESSION_INVALIDATED = 'SESSION_INVALIDATED',
  NEW_SESSION_STARTED = 'NEW_SESSION_STARTED',
  EXISTING_SESSION_DETECTED = 'EXISTING_SESSION_DETECTED',
  EMAIL_SENT = 'EMAIL_SENT',
  EMAIL_ERROR = 'EMAIL_ERROR',
  ACCOUNT_DISABLED = 'ACCOUNT_DISABLED',
  KYC_VERIFICATION = 'KYC_VERIFICATION',
  KYC_STATUS_UPDATED = 'KYC_STATUS_UPDATED',
  KYC_DOCUMENT_SUBMITTED = 'KYC_DOCUMENT_SUBMITTED',
  KYC_DOCUMENT_REJECTED = 'KYC_DOCUMENT_REJECTED',
  KYC_DOCUMENT_APPROVED = 'KYC_DOCUMENT_APPROVED',
  BUSINESS_STATUS_UPDATE = 'BUSINESS_STATUS_UPDATE',
  BUSINESS_CREATED = 'BUSINESS_CREATED',
  BUSINESS_UPDATED = 'BUSINESS_UPDATED',
  BUSINESS_DELETED = 'BUSINESS_DELETED',
}

// Define the log interface
export interface ILog extends Document {
  timestamp: Date;
  type: LogType;
  severity: LogSeverity;
  message: string;
  action?: string;
  userId?: string;
  ip?: string;
  userAgent?: string;
  route?: string;
  method?: string;
  statusCode?: number;
  error?: string;
  metadata?: Record<string, any>;
}

// Create the log schema
const logSchema = new Schema<ILog>(
  {
    timestamp: {
      type: Date,
      default: Date.now,
    },
    type: {
      type: String,
      enum: Object.values(LogType),
      required: true,
    },
    severity: {
      type: String,
      enum: Object.values(LogSeverity),
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    action: {
      type: String,
      enum: Object.values(SecurityAction),
    },
    userId: {
      type: String,
      index: true,
    },
    ip: String,
    userAgent: String,
    route: String,
    method: String,
    statusCode: Number,
    error: String,
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

// Create indexes for common query patterns
logSchema.index({ timestamp: -1 });
logSchema.index({ type: 1, timestamp: -1 });
logSchema.index({ severity: 1, timestamp: -1 });
logSchema.index({ action: 1, timestamp: -1 });

// Create the Log model
export const Log = mongoose.model<ILog>('Log', logSchema);
