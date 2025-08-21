import mongoose, { Document, Schema } from 'mongoose';

export interface IWebhookActivity extends Document {
  businessId: mongoose.Types.ObjectId;
  event: string;
  webhookUrl: string;
  requestBody: any;
  requestHeaders: any;
  responseStatus?: number;
  responseBody?: any;
  error?: string;
  duration: number;
  status: 'success' | 'failed' | 'pending';
  retryCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const webhookActivitySchema = new Schema<IWebhookActivity>(
  {
    businessId: {
      type: Schema.Types.ObjectId,
      ref: 'Business',
      required: false,
      index: true,
    },
    event: {
      type: String,
      required: true,
      index: true,
    },
    webhookUrl: {
      type: String,
      required: true,
    },
    requestBody: {
      type: Schema.Types.Mixed,
      required: true,
    },
    requestHeaders: {
      type: Schema.Types.Mixed,
      required: true,
    },
    responseStatus: {
      type: Number,
    },
    responseBody: {
      type: Schema.Types.Mixed,
    },
    error: {
      type: String,
    },
    duration: {
      type: Number,
      required: true,
      comment: 'Duration in milliseconds',
    },
    status: {
      type: String,
      enum: ['success', 'failed', 'pending'],
      required: true,
      index: true,
    },
    retryCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient querying
webhookActivitySchema.index({ businessId: 1, createdAt: -1 });
webhookActivitySchema.index({ event: 1, status: 1 });
webhookActivitySchema.index({ createdAt: -1 });

export const WebhookActivity = mongoose.model<IWebhookActivity>(
  'WebhookActivity',
  webhookActivitySchema
);
