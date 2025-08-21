import { Schema, model, Document, Model, Types } from 'mongoose';

export type TransactionType = 'payment' | 'refund' | 'transfer' | 'withdrawal';
export type TransactionStatus = 'pending' | 'completed' | 'failed' | 'cancelled' | 'refunded';

export interface ITransaction extends Document {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  business: Types.ObjectId;
  type: TransactionType;
  amount: number;
  currency: string;
  status: TransactionStatus;
  description?: string;
  metadata?: {
    paymentMethod?: string;
    paymentProvider?: string;
    transactionId?: string;
    customerEmail?: string;
    customerPhone?: string;
    [key: string]: any;
  };
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  refundDetails?: {
    originalTransaction: Types.ObjectId;
    reason: string;
    refundedAt: Date;
  };
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  cancelledAt?: Date;
  failedAt?: Date;
  refundedAt?: Date;
  orderNo?: string;
  orderId?: string;
  previousBalance?: number;
  newBalance?: number;
  charges?: {
    amount: number;
    type: 'payment' | 'withdrawal';
    percentage?: number;
    fixed?: number;
  };
}

const transactionSchema = new Schema<ITransaction, Model<ITransaction>>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Transaction must belong to a user'],
    },
    business: {
      type: Schema.Types.ObjectId,
      ref: 'Business',
      required: [true, 'Transaction must belong to a business'],
    },
    type: {
      type: String,
      enum: ['payment', 'refund', 'transfer', 'withdrawal'],
      required: [true, 'Transaction type is required'],
    },
    amount: {
      type: Number,
      required: [true, 'Transaction amount is required'],
      min: [0, 'Amount cannot be negative'],
    },
    currency: {
      type: String,
      required: [true, 'Currency is required'],
      default: 'NGN',
    },
    status: {
      type: String,
      enum: ['pending', 'completed', 'failed', 'cancelled', 'refunded'],
      default: 'pending',
    },
    description: {
      type: String,
      trim: true,
    },
    metadata: {
      type: Map,
      of: Schema.Types.Mixed,
    },
    error: {
      code: String,
      message: String,
      details: Schema.Types.Mixed,
    },
    refundDetails: {
      originalTransaction: {
        type: Schema.Types.ObjectId,
        ref: 'Transaction',
      },
      reason: String,
      refundedAt: Date,
    },
    completedAt: Date,
    cancelledAt: Date,
    failedAt: Date,
    refundedAt: Date,
    orderNo: {
      type: String,
    },
    orderId: {
      type: String,
      sparse: true,
    },
    previousBalance: Number,
    newBalance: Number,
    charges: {
      amount: {
        type: Number,
        default: 0,
      },
      type: {
        type: String,
        enum: ['payment', 'withdrawal'],
      },
      percentage: Number,
      fixed: Number,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for faster queries
transactionSchema.index({ user: 1, createdAt: -1 });
transactionSchema.index({ business: 1, createdAt: -1 });
transactionSchema.index({ status: 1 });
transactionSchema.index({ type: 1 });
transactionSchema.index({ 'metadata.transactionId': 1 }, { unique: true, sparse: true });
transactionSchema.index({ orderNo: 1 }, { unique: true, sparse: true });
transactionSchema.index({ 'metadata.payerAccountName': 1 });
transactionSchema.index({ 'metadata.virtualAccountName': 1 });
// Compound index for idempotency check
transactionSchema.index({ business: 1, orderId: 1, type: 1 }, { unique: true, sparse: true });

// Pre-save middleware to handle status changes
transactionSchema.pre('save', function (next) {
  if (this.isModified('status')) {
    const now = new Date();
    switch (this.status) {
      case 'completed':
        this.completedAt = now;
        break;
      case 'cancelled':
        this.cancelledAt = now;
        break;
      case 'failed':
        this.failedAt = now;
        break;
      case 'refunded':
        this.refundedAt = now;
        break;
    }
  }
  next();
});

// Static method to create a refund transaction
transactionSchema.statics.createRefund = async function (
  originalTransaction: Types.ObjectId,
  amount: number,
  reason: string,
  metadata?: any
) {
  const original = await this.findById(originalTransaction);
  if (!original) {
    throw new Error('Original transaction not found');
  }

  if (original.status !== 'completed') {
    throw new Error('Can only refund completed transactions');
  }

  if (amount > original.amount) {
    throw new Error('Refund amount cannot exceed original transaction amount');
  }

  return this.create({
    user: original.user,
    business: original.business,
    type: 'refund',
    amount,
    currency: original.currency,
    status: 'pending',
    description: `Refund for transaction ${original._id}`,
    metadata,
    refundDetails: {
      originalTransaction: original._id,
      reason,
    },
  });
};

// Method to update transaction status
transactionSchema.methods.updateStatus = async function (
  newStatus: TransactionStatus,
  error?: { code: string; message: string; details?: any }
) {
  this.status = newStatus;
  if (error) {
    this.error = error;
  }
  return this.save();
};

export const Transaction = model<ITransaction, Model<ITransaction>>(
  'Transaction',
  transactionSchema
);
