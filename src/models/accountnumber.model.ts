import { Schema, model, Document, Types } from 'mongoose';

interface IAccountNumber extends Document {
  bankName: string;
  accountNumber: string;
  email: string;
  businessId: Types.ObjectId;
  accountName: string;
  userName: string;
  bvn: string;
  nin: string;
  licenseNumber: string;
  createdAt: Date;
  updatedAt: Date;
}

const accountNumberSchema = new Schema<IAccountNumber>(
  {
    bankName: {
      type: String,
      required: [true, 'Bank name is required'],
      trim: true,
    },
    accountNumber: {
      type: String,
      required: [true, 'Account number is required'],
      trim: true,
      minlength: [10, 'Account number must be 10 digits'],
      maxlength: [10, 'Account number must be 10 digits'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email'],
    },
    businessId: {
      type: Schema.Types.ObjectId,
      ref: 'Business',
      required: [true, 'Business ID is required'],
      trim: true,
      index: true,
    },
    accountName: {
      type: String,
      required: [true, 'Account name is required'],
      trim: true,
    },
    userName: {
      type: String,
      required: [true, 'Username is required'],
      trim: true,
    },
    bvn: {
      type: String,
      trim: true,
      minlength: [11, 'BVN must be 11 digits'],
      maxlength: [11, 'BVN must be 11 digits'],
    },
    nin: {
      type: String,
      trim: true,
      minlength: [11, 'NIN must be 11 digits'],
      maxlength: [11, 'NIN must be 11 digits'],
    },
    licenseNumber: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes
accountNumberSchema.index({ businessId: 1 });

const AccountNumber = model<IAccountNumber>('AccountNumber', accountNumberSchema);

export default AccountNumber;
