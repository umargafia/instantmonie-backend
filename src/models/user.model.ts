import { Schema, model, Document, Model, Query, QueryWithHelpers, Types } from 'mongoose';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import validator from 'validator';

export interface IUser extends Document {
  _id: Types.ObjectId;
  name: string;
  username: string;
  email: string;
  phone: string;
  photo?: string;
  role: 'user' | 'admin';
  password: string;
  passwordConfirm?: string;
  passwordChangedAt?: Date;
  passwordResetToken?: string;
  passwordResetExpires?: Date;
  active: boolean;
  loginAttempts: number;
  lockUntil?: Date;
  lastLoginIP?: string;
  lastLoginDate?: Date;
  businessId?: Types.ObjectId;
  activeSession?: {
    token: string;
    device: string;
    ip: string;
    lastActive: Date;
  };
  welcomeEmailSent: boolean;
  disabled: boolean;
  correctPassword(candidatePassword: string, userPassword: string): Promise<boolean>;
  changedPasswordAfter(JWTTimestamp: number): boolean;
  createPasswordResetToken(): string;
  otp: {
    code: string;
    expiresAt: Date;
    attempts: number;
    lastAttempt: Date;
    lockedUntil: Date;
    locked: boolean;
    lockedReason: string;
    type: 'forgot-password' | 'verify-email' | 'withdrawal' | '';
  };
}

interface IUserMethods {
  correctPassword(candidatePassword: string, userPassword: string): Promise<boolean>;
  changedPasswordAfter(JWTTimestamp: number): boolean;
  createPasswordResetToken(): string;
}

const userSchema = new Schema<IUser, Model<IUser>, IUserMethods>(
  {
    name: {
      type: String,
      required: [true, 'Please tell us your name'],
    },
    username: {
      type: String,
      required: [true, 'Please provide a username'],
      unique: true,
      trim: true,
      minlength: [3, 'Username must be at least 3 characters long'],
    },
    email: {
      type: String,
      required: [true, 'Please provide your email'],
      unique: true,
      lowercase: true,
      validate: [validator.isEmail, 'Please provide a valid email'],
    },
    phone: {
      type: String,
      required: [true, 'Please provide your phone number'],
      validate: {
        validator: function (v: string) {
          return /^\+?[\d\s-()]{10,}$/.test(v);
        },
        message: 'Please provide a valid phone number',
      },
    },
    photo: String,
    businessId: {
      type: Schema.Types.ObjectId,
      ref: 'Business',
    },
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
    },
    password: {
      type: String,
      required: [true, 'Please provide a password'],
      minlength: 8,
      select: false,
    },
    passwordConfirm: {
      type: String,
      required: [true, 'Please confirm your password'],
      validate: {
        validator: function (this: IUser, el: string) {
          return el === this.password;
        },
        message: 'Passwords do not match',
      },
    },
    passwordChangedAt: Date,
    passwordResetToken: String,
    passwordResetExpires: Date,
    active: {
      type: Boolean,
      default: true,
      select: false,
    },
    loginAttempts: {
      type: Number,
      default: 0,
    },
    lockUntil: {
      type: Date,
      default: undefined,
    },
    lastLoginIP: {
      type: String,
      default: 'unknown',
    },
    lastLoginDate: {
      type: Date,
      default: Date.now,
    },
    welcomeEmailSent: {
      type: Boolean,
      default: false,
    },
    activeSession: {
      type: {
        token: String,
        device: String,
        ip: String,
        lastActive: {
          type: Date,
          default: Date.now,
        },
      },
      default: undefined,
    },
    disabled: {
      type: Boolean,
      default: false,
    },
    otp: {
      code: String,
      expiresAt: Date,
      attempts: {
        type: Number,
      },
      lastAttempt: Date,
      lockedUntil: Date,
      locked: Boolean,
      lockedReason: String,
      type: {
        type: String,
        enum: ['forgot-password', 'verify-email', 'withdrawal', ''],
      },
    },
  },
  {
    timestamps: true,
  }
);

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  this.passwordConfirm = '';
  next();
});

// Update passwordChangedAt when password is changed
userSchema.pre('save', function (next) {
  if (!this.isModified('password') || this.isNew) return next();
  this.passwordChangedAt = new Date(Date.now() - 1000);
  next();
});

// Only find active users
userSchema.pre(/^find/, function (this: QueryWithHelpers<IUser[], IUser>, next) {
  this.find({ active: { $ne: false } });
  next();
});

// Instance methods
userSchema.methods.correctPassword = async function (
  candidatePassword: string,
  userPassword: string
): Promise<boolean> {
  return await bcrypt.compare(candidatePassword, userPassword);
};

userSchema.methods.changedPasswordAfter = function (JWTTimestamp: number): boolean {
  if (this.passwordChangedAt) {
    const changedTimestamp = Math.floor(this.passwordChangedAt.getTime() / 1000);
    return changedTimestamp > JWTTimestamp;
  }
  return false;
};

userSchema.methods.createPasswordResetToken = function (): string {
  const resetToken = crypto.randomBytes(32).toString('hex');

  this.passwordResetToken = crypto.createHash('sha256').update(resetToken).digest('hex');

  this.passwordResetExpires = new Date(Date.now() + 10 * 60 * 1000);

  return resetToken;
};

export const User = model<IUser, Model<IUser, {}, IUserMethods>>('User', userSchema);
