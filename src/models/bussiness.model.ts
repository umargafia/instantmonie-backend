import { Schema, model, Document, Model, Types } from 'mongoose';
import crypto from 'crypto';
import encryptKey, { algorithm, encryptionKey } from '@/utils/encryptKey';

export interface IBusiness extends Document {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  name: string;
  description: string;
  balance: number;
  apiKey: string;
  secretKey: string;
  compliance: {
    licenseNumber: string;
    businessType: 'registeredBusiness' | 'nonRegisteredBusiness';
    email: string;
    phoneNumber: string;
    legalBusinessName: string;
    businessWebsiteUrl: string;
    businessDescription: string;
    businessIndustry: string;
    state: string;
    lga: string;
    streetAddress: string;
    kyc: {
      personalInfoDocument: {
        type:
          | 'driversLicense'
          | 'votersCard'
          | 'ninSlip'
          | 'internationalPassport'
          | 'nationalIdCard';
        image: string;
        status: 'pending' | 'verified' | 'rejected' | 'not_submitted';
        verificationDate: Date;
        rejectReason: string;
      };
      bvn: {
        number: string;
        status: 'pending' | 'verified' | 'rejected' | 'not_submitted';
        verificationDate: Date;
        rejectReason: string;
      };
      videoConfirmation: {
        url: string;
        status: 'pending' | 'verified' | 'rejected' | 'not_submitted';
        verificationDate: Date;
        rejectReason: string;
        word: string;
      };
      proofOfAddress: {
        document: string;
        status: 'pending' | 'verified' | 'rejected' | 'not_submitted';
        verificationDate: Date;
        rejectReason: string;
      };
      certificateOfIncorporation: {
        document: string;
        status: 'pending' | 'verified' | 'rejected' | 'not_submitted';
        verificationDate: Date;
        rejectReason: string;
      };
      lastUpdated: Date;
    };
    verificationStatus: 'in_progress' | 'completed' | 'rejected' | 'not_submitted';
  };
  createdAt: Date;
  updatedAt: Date;
  decryptSecretKey(encryptedKey: string): string;
  webhookUrl: string;
  websiteUrl: string;
  accountDetails: {
    accountNumber: string;
    accountName: string;
    bankCode: string;
    bankName: string;
    bankLogo: string;
  };
  charges?: {
    payment: {
      percentage: number;
      cap: number;
      useDefault: boolean;
      fixedPrice: number;
      type: 'percentage' | 'fixed';
    };
    withdrawal: {
      tier1: { min: number; max: number; fee: number };
      tier2: { min: number; max: number; fee: number };
      tier3: { min: number; fee: number };
      useDefault: boolean;
    };
  };
  status: 'active' | 'suspended' | 'blocked';
}

const businessSchema = new Schema<IBusiness, Model<IBusiness>>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Business must belong to a user'],
    },
    name: {
      type: String,
      required: [true, 'Please provide a business name'],
      trim: true,
      unique: true,
    },
    description: {
      type: String,
      trim: true,
    },
    balance: {
      type: Number,
      min: [0, 'Amount cannot be negative'],
      default: 0,
    },
    apiKey: {
      type: String,
      required: [true, 'API key is required'],
    },
    secretKey: {
      type: String,
      required: [true, 'Secret key is required'],
      select: false,
    },
    webhookUrl: {
      type: String,
      trim: true,
    },
    websiteUrl: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ['active', 'suspended', 'blocked'],
      default: 'active',
    },
    compliance: {
      businessType: {
        type: String,
        enum: ['registeredBusiness', 'nonRegisteredBusiness'],
      },
      email: {
        type: String,
        trim: true,
        lowercase: true,
      },
      phoneNumber: {
        type: String,
        trim: true,
      },
      legalBusinessName: {
        type: String,
        trim: true,
      },
      businessWebsiteUrl: {
        type: String,
        trim: true,
      },
      businessDescription: {
        type: String,
        trim: true,
      },
      businessIndustry: {
        type: String,
        trim: true,
      },
      state: {
        type: String,
        trim: true,
      },
      lga: {
        type: String,
        trim: true,
      },
      streetAddress: {
        type: String,
        trim: true,
      },
      kyc: {
        personalInfoDocument: {
          type: {
            type: String,
            enum: [
              'driversLicense',
              'votersCard',
              'ninSlip',
              'internationalPassport',
              'nationalIdCard',
            ],
          },
          image: String,
          status: {
            type: String,
            enum: ['pending', 'verified', 'rejected', 'not_submitted'],
            default: 'not_submitted',
          },
          verificationDate: Date,
          rejectReason: String,
        },
        bvn: {
          number: {
            type: String,
            trim: true,
          },
          status: {
            type: String,
            enum: ['pending', 'verified', 'rejected', 'not_submitted'],
            default: 'not_submitted',
          },
          verificationDate: Date,
          rejectReason: String,
        },
        videoConfirmation: {
          url: String,
          status: {
            type: String,
            enum: ['pending', 'verified', 'rejected', 'not_submitted'],
            default: 'not_submitted',
          },
          verificationDate: Date,
          rejectReason: String,
          word: String,
        },
        proofOfAddress: {
          document: String,
          status: {
            type: String,
            enum: ['pending', 'verified', 'rejected', 'not_submitted'],
            default: 'not_submitted',
          },
          verificationDate: Date,
          rejectReason: String,
        },
        certificateOfIncorporation: {
          document: String,
          status: {
            type: String,
            enum: ['pending', 'verified', 'rejected', 'not_submitted'],
            default: 'not_submitted',
          },
          verificationDate: Date,
          rejectReason: String,
        },
        lastUpdated: Date,
      },
      verificationStatus: {
        type: String,
        enum: ['completed', 'rejected', 'not_submitted', 'in_progress'],
        default: 'not_submitted',
      },
      licenseNumber: {
        type: String,
        trim: true,
      },
    },
    accountDetails: {
      accountNumber: {
        type: String,
        trim: true,
      },
      accountName: {
        type: String,
        trim: true,
      },
      bankCode: {
        type: String,
      },
      bankName: {
        type: String,
        trim: true,
      },
      bankLogo: {
        type: String,
      },
    },
    charges: {
      payment: {
        percentage: {
          type: Number,
          default: 1.5,
        },
        cap: {
          type: Number,
          default: 500,
        },
        useDefault: {
          type: Boolean,
          default: true,
        },
        fixedPrice: {
          type: Number,
          default: 0,
        },
        type: {
          type: String,
          enum: ['percentage', 'fixed'],
          default: 'percentage',
        },
      },
      withdrawal: {
        tier1: {
          min: {
            type: Number,
            default: 0,
          },
          max: {
            type: Number,
            default: 5000,
          },
          fee: {
            type: Number,
            default: 20,
          },
        },
        tier2: {
          min: {
            type: Number,
            default: 5000.01,
          },
          max: {
            type: Number,
            default: 50000,
          },
          fee: {
            type: Number,
            default: 40,
          },
        },
        tier3: {
          min: {
            type: Number,
            default: 50000.01,
          },
          fee: {
            type: Number,
            default: 65,
          },
        },
        useDefault: {
          type: Boolean,
          default: true,
        },
      },
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for faster queries
businessSchema.index({ user: 1, createdAt: -1 });
businessSchema.index({ 'compliance.verificationStatus': 1 });
businessSchema.index({ 'compliance.kycStatus': 1 });

businessSchema.pre('save', function (next) {
  if (this.isModified('secretKey')) {
    this.secretKey = encryptKey(this.secretKey);
  }

  next();
});

businessSchema.methods.decryptSecretKey = function (encryptedKey: string): string {
  const [ivHex, encrypted] = encryptedKey.split(':');
  const iv = Buffer.from(ivHex, 'hex');

  const decipher = crypto.createDecipheriv(algorithm, Buffer.from(encryptionKey), iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
};

export const Business = model<IBusiness, Model<IBusiness>>('Business', businessSchema);
