import { Request, Response } from 'express';
import { Business } from '../../models/bussiness.model';
import { Log, LogType, LogSeverity, SecurityAction } from '../../models/log.model';
import { catchAsync } from '../../utils/catchAsync';
import { AppError } from '../../utils/AppError';

type DocumentType =
  | 'personalInfoDocument'
  | 'bvn'
  | 'videoConfirmation'
  | 'proofOfAddress'
  | 'certificateOfIncorporation';
type VerificationStatus = 'pending' | 'verified' | 'rejected' | 'not_submitted';
type OverallStatus = 'in_progress' | 'completed' | 'rejected' | 'not_submitted';

// Validation function for KYC status updates
const validateKYCStatusUpdate = (req: Request) => {
  const {
    personalInfoDocumentStatus,
    bvnStatus,
    videoConfirmationStatus,
    proofOfAddressStatus,
    certificateOfIncorporationStatus,
    rejectionReasons,
  } = req.body;

  // Validate status values
  const validStatuses: VerificationStatus[] = ['pending', 'verified', 'rejected', 'not_submitted'];
  const statuses = [
    personalInfoDocumentStatus,
    bvnStatus,
    videoConfirmationStatus,
    proofOfAddressStatus,
    certificateOfIncorporationStatus,
  ].filter(Boolean);

  for (const status of statuses) {
    if (!validStatuses.includes(status)) {
      throw new AppError(`Invalid status: ${status}`, 400);
    }
  }

  // Validate rejection reasons when status is rejected
  if (personalInfoDocumentStatus === 'rejected' && !rejectionReasons?.personalInfoDocumentReason) {
    throw new AppError('Rejection reason required for personal info document', 400);
  }
  if (bvnStatus === 'rejected' && !rejectionReasons?.bvnReason) {
    throw new AppError('Rejection reason required for BVN', 400);
  }
  if (videoConfirmationStatus === 'rejected' && !rejectionReasons?.videoConfirmationReason) {
    throw new AppError('Rejection reason required for video confirmation', 400);
  }
  if (proofOfAddressStatus === 'rejected' && !rejectionReasons?.proofOfAddressReason) {
    throw new AppError('Rejection reason required for proof of address', 400);
  }
  if (
    certificateOfIncorporationStatus === 'rejected' &&
    !rejectionReasons?.certificateOfIncorporationReason
  ) {
    throw new AppError('Rejection reason required for certificate of incorporation', 400);
  }

  return req.body;
};

// Helper function to get all KYC statuses consistently
const getAllKYCStatuses = (business: any) => {
  const baseStatuses = [
    business.compliance.kyc.personalInfoDocument?.status,
    business.compliance.kyc.bvn?.status,
    business.compliance.kyc.videoConfirmation?.status,
    business.compliance.kyc.proofOfAddress?.status,
  ].filter(Boolean);

  // Only include certificate if business is registered and document exists
  if (
    business.compliance.businessType === 'registeredBusiness' &&
    business.compliance.kyc.certificateOfIncorporation?.status
  ) {
    baseStatuses.push(business.compliance.kyc.certificateOfIncorporation.status);
  }

  return baseStatuses;
};

// Get all KYC applications with filtering and pagination
export const getAllKYC = catchAsync(async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const skip = (page - 1) * limit;

  // Build query based on filters
  const query: any = {};

  if (req.query.search) {
    query.$or = [
      { name: { $regex: req.query.search, $options: 'i' } },
      { _id: { $regex: req.query.search, $options: 'i' } },
    ];
  }

  if (req.query.businessType) {
    query['compliance.businessType'] = req.query.businessType;
  }

  if (req.query.verificationStatus) {
    query['compliance.verificationStatus'] = req.query.verificationStatus;
  }

  if (req.query.documentType) {
    query['compliance.kyc.personalInfoDocument.type'] = req.query.documentType;
  }

  if (req.query.dateRange) {
    const [startDate, endDate] = (req.query.dateRange as string).split('-');
    query['compliance.kyc.lastUpdated'] = {
      $gte: new Date(startDate),
      $lte: new Date(endDate),
    };
  }

  // Get businesses with KYC info with pagination
  const businesses = await Business.find(query)
    .select('name compliance.kyc compliance.businessType compliance.verificationStatus')
    .populate('user', 'email phone')
    .skip(skip)
    .limit(limit)
    .sort({ 'compliance.kyc.lastUpdated': -1 });

  // Get total count for pagination
  const total = await Business.countDocuments(query);

  // Get KYC statistics
  const stats = await Business.aggregate([
    {
      $group: {
        _id: null,
        totalApplications: { $sum: 1 },
        verifiedApplications: {
          $sum: {
            $cond: [{ $eq: ['$compliance.verificationStatus', 'completed'] }, 1, 0],
          },
        },
        pendingApplications: {
          $sum: {
            $cond: [{ $eq: ['$compliance.verificationStatus', 'in_progress'] }, 1, 0],
          },
        },
        rejectedApplications: {
          $sum: {
            $cond: [{ $eq: ['$compliance.verificationStatus', 'rejected'] }, 1, 0],
          },
        },
      },
    },
  ]);

  res.status(200).json({
    status: 'success',
    data: {
      businesses,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit),
      },
      stats: stats[0] || {
        totalApplications: 0,
        verifiedApplications: 0,
        pendingApplications: 0,
        rejectedApplications: 0,
      },
    },
  });
});

// Get single KYC application
export const getKYC = catchAsync(async (req: Request, res: Response) => {
  const business = await Business.findById(req.params.id)
    .select('name compliance')
    .populate('user', 'email phone');

  if (!business) {
    throw new AppError('Business not found', 404);
  }

  res.status(200).json({
    status: 'success',
    data: business,
  });
});

// Update KYC document status
export const updateKYCStatus = catchAsync(async (req: Request, res: Response) => {
  // Validate request body
  const validatedData = validateKYCStatusUpdate(req);

  const {
    personalInfoDocumentStatus,
    bvnStatus,
    videoConfirmationStatus,
    proofOfAddressStatus,
    certificateOfIncorporationStatus,
    rejectionReasons: {
      personalInfoDocumentReason,
      bvnReason,
      videoConfirmationReason,
      proofOfAddressReason,
      certificateOfIncorporationReason,
    },
  } = validatedData;

  const business = await Business.findById(req.params.id);
  if (!business) {
    throw new AppError('Business not found', 404);
  }

  // Ensure KYC structure exists
  if (!business.compliance.kyc) {
    business.compliance.kyc = {
      personalInfoDocument: {
        type: 'driversLicense' as const,
        image: '',
        status: 'not_submitted' as const,
        verificationDate: new Date(),
        rejectReason: '',
      },
      bvn: {
        number: '',
        status: 'not_submitted' as const,
        verificationDate: new Date(),
        rejectReason: '',
      },
      videoConfirmation: {
        url: '',
        status: 'not_submitted' as const,
        verificationDate: new Date(),
        rejectReason: '',
        word: '',
      },
      proofOfAddress: {
        document: '',
        status: 'not_submitted' as const,
        verificationDate: new Date(),
        rejectReason: '',
      },
      certificateOfIncorporation: {
        document: '',
        status: 'not_submitted' as const,
        verificationDate: new Date(),
        rejectReason: '',
      },
      lastUpdated: new Date(),
    };
  }

  // Update individual statuses if provided
  if (personalInfoDocumentStatus) {
    business.compliance.kyc.personalInfoDocument.status = personalInfoDocumentStatus;
    if (personalInfoDocumentStatus === 'rejected') {
      business.compliance.kyc.personalInfoDocument.rejectReason = personalInfoDocumentReason || '';
    } else {
      business.compliance.kyc.personalInfoDocument.rejectReason = '';
    }
  }

  if (bvnStatus) {
    business.compliance.kyc.bvn.status = bvnStatus;
    if (bvnStatus === 'rejected') {
      business.compliance.kyc.bvn.rejectReason = bvnReason || '';
    } else {
      business.compliance.kyc.bvn.rejectReason = '';
    }
  }

  if (videoConfirmationStatus) {
    business.compliance.kyc.videoConfirmation.status = videoConfirmationStatus;
    if (videoConfirmationStatus === 'rejected') {
      business.compliance.kyc.videoConfirmation.rejectReason = videoConfirmationReason || '';
    } else {
      business.compliance.kyc.videoConfirmation.rejectReason = '';
    }
  }

  if (proofOfAddressStatus) {
    business.compliance.kyc.proofOfAddress.status = proofOfAddressStatus;
    if (proofOfAddressStatus === 'rejected') {
      business.compliance.kyc.proofOfAddress.rejectReason = proofOfAddressReason || '';
    } else {
      business.compliance.kyc.proofOfAddress.rejectReason = '';
    }
  }

  if (certificateOfIncorporationStatus) {
    business.compliance.kyc.certificateOfIncorporation.status = certificateOfIncorporationStatus;
    if (certificateOfIncorporationStatus === 'rejected') {
      business.compliance.kyc.certificateOfIncorporation.rejectReason =
        certificateOfIncorporationReason || '';
    } else {
      business.compliance.kyc.certificateOfIncorporation.rejectReason = '';
    }
  }

  // Update overall KYC status using consistent logic
  const kycStatuses = getAllKYCStatuses(business);

  if (kycStatuses.length === 0) {
    business.compliance.verificationStatus = 'not_submitted';
  } else {
    const allVerified = kycStatuses.every((status) => status === 'verified');
    const anyRejected = kycStatuses.some((status) => status === 'rejected');
    const anyPending = kycStatuses.some((status) => status === 'pending');

    business.compliance.verificationStatus = allVerified
      ? 'completed'
      : anyRejected
        ? 'rejected'
        : anyPending
          ? 'in_progress'
          : 'not_submitted';
  }

  business.compliance.kyc.lastUpdated = new Date();
  await business.save();

  // Log the action
  await Log.create({
    type: LogType.SECURITY,
    severity: LogSeverity.INFO,
    action: SecurityAction.KYC_STATUS_UPDATED,
    message: `KYC status updated for business ${business.name}`,
    metadata: {
      businessId: business._id,
      personalInfoDocumentStatus,
      bvnStatus,
      videoConfirmationStatus,
      proofOfAddressStatus,
      certificateOfIncorporationStatus,
      previousStatus: business.compliance.verificationStatus,
    },
  });

  res.status(200).json({
    status: 'success',
    message: 'KYC status updated successfully',
    data: {
      kyc: business.compliance.kyc,
      verificationStatus: business.compliance.verificationStatus,
    },
  });
});

// Get KYC statistics
export const getKYCStats = catchAsync(async (req: Request, res: Response) => {
  const period = (req.query.period as string) || 'all';
  const startDate = getStartDate(period);

  const stats = await Business.aggregate([
    {
      $match: {
        'compliance.kyc.lastUpdated': { $gte: startDate },
      },
    },
    {
      $group: {
        _id: null,
        totalApplications: { $sum: 1 },
        verifiedApplications: {
          $sum: {
            $cond: [{ $eq: ['$compliance.verificationStatus', 'completed'] }, 1, 0],
          },
        },
        pendingApplications: {
          $sum: {
            $cond: [{ $eq: ['$compliance.verificationStatus', 'in_progress'] }, 1, 0],
          },
        },
        rejectedApplications: {
          $sum: {
            $cond: [{ $eq: ['$compliance.verificationStatus', 'rejected'] }, 1, 0],
          },
        },
      },
    },
  ]);

  // Get document type distribution
  const documentStats = await Business.aggregate([
    {
      $match: {
        'compliance.kyc.lastUpdated': { $gte: startDate },
      },
    },
    {
      $group: {
        _id: '$compliance.kyc.personalInfoDocument.type',
        count: { $sum: 1 },
      },
    },
  ]);

  res.status(200).json({
    status: 'success',
    data: {
      stats: stats[0] || {
        totalApplications: 0,
        verifiedApplications: 0,
        pendingApplications: 0,
        rejectedApplications: 0,
      },
      documentStats,
    },
  });
});

// Helper function to get start date based on period
const getStartDate = (period: string): Date => {
  const now = new Date();
  switch (period) {
    case 'today':
      return new Date(now.setHours(0, 0, 0, 0));
    case 'week':
      return new Date(now.setDate(now.getDate() - 7));
    case 'month':
      return new Date(now.setMonth(now.getMonth() - 1));
    case 'year':
      return new Date(now.setFullYear(now.getFullYear() - 1));
    default:
      return new Date(0); // Beginning of time
  }
};
