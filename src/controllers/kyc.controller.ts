import { Request, Response } from 'express';
import { Business } from '@/models/bussiness.model';
import { catchAsync } from '@/utils/catchAsync';
import { AppError } from '@/utils/AppError';

// Submit Business Information
export const submitBusinessInformation = catchAsync(async (req: Request, res: Response) => {
  const {
    businessType,
    email,
    phoneNumber,
    legalBusinessName,
    businessWebsiteUrl,
    businessDescription,
    businessIndustry,
    otherIndustry,
    licenseNumber,
    state,
    lga,
    streetAddress,
    bvn,
    nin,
    dateOfBirth,
  } = req.body;

  const business = await Business.findById(req.params.businessId);
  if (!business) {
    throw new AppError('Business not found', 404);
  }

  // Validate required fields
  if (
    !businessType ||
    !email ||
    !phoneNumber ||
    !legalBusinessName ||
    !businessDescription ||
    !businessIndustry ||
    !state ||
    !lga ||
    !streetAddress
  ) {
    throw new AppError('Missing required business information fields', 400);
  }

  // Update business compliance information
  business.compliance.businessType = businessType;
  business.compliance.email = email;
  business.compliance.phoneNumber = phoneNumber;
  business.compliance.legalBusinessName = legalBusinessName;
  business.compliance.businessWebsiteUrl = businessWebsiteUrl;
  business.compliance.businessDescription = businessDescription;
  business.compliance.businessIndustry = businessIndustry;
  business.compliance.state = state;
  business.compliance.lga = lga;
  business.compliance.streetAddress = streetAddress;
  business.compliance.licenseNumber = licenseNumber;

  // Update BVN if provided
  if (bvn) {
    business.compliance.kyc.bvn = {
      number: bvn,
      status: 'pending',
      verificationDate: new Date(),
      rejectReason: '',
    };
  }

  // Update NIN if provided
  if (nin) {
    // Note: NIN is not in the current model, but we can add it if needed
    // business.compliance.kyc.nin = {
    //   number: nin,
    //   status: 'pending',
    //   verificationDate: new Date(),
    //   rejectReason: '',
    // };
  }

  business.compliance.kyc.lastUpdated = new Date();
  business.compliance.verificationStatus = 'in_progress';

  await business.save();

  res.status(200).json({
    status: 'success',
    message: 'Business information submitted successfully',
    data: {
      compliance: business.compliance,
    },
  });
});

// Get KYC status for a business
export const getKycStatus = catchAsync(async (req: Request, res: Response) => {
  const business = await Business.findById(req.params.businessId);

  if (!business) {
    throw new AppError('Business not found', 404);
  }

  res.status(200).json({
    status: 'success',
    data: business.compliance,
  });
});

// Submit Personal Information Document
export const submitPersonalInfoDocument = catchAsync(async (req: Request, res: Response) => {
  const { type, image } = req.body;

  const business = await Business.findById(req.params.businessId);
  if (!business) {
    throw new AppError('Business not found', 404);
  }

  business.compliance.kyc.personalInfoDocument = {
    type,
    image,
    status: 'pending',
    verificationDate: new Date(),
    rejectReason: '',
  };
  business.compliance.kyc.lastUpdated = new Date();
  business.compliance.verificationStatus = 'in_progress';

  await business.save();

  res.status(200).json({
    status: 'success',
    message: 'Personal information document submitted successfully',
    data: {
      personalInfoDocument: business.compliance.kyc.personalInfoDocument,
    },
  });
});

// Submit BVN
export const submitBVN = catchAsync(async (req: Request, res: Response) => {
  const { number } = req.body;

  const business = await Business.findById(req.params.businessId);
  if (!business) {
    throw new AppError('Business not found', 404);
  }

  business.compliance.kyc.bvn = {
    number,
    status: 'pending',
    verificationDate: new Date(),
    rejectReason: '',
  };
  business.compliance.kyc.lastUpdated = new Date();
  business.compliance.verificationStatus = 'in_progress';

  await business.save();

  res.status(200).json({
    status: 'success',
    message: 'BVN submitted successfully',
    data: {
      bvn: business.compliance.kyc.bvn,
    },
  });
});

// Submit Video Confirmation
export const submitVideoConfirmation = catchAsync(async (req: Request, res: Response) => {
  const { url, word } = req.body;

  const business = await Business.findById(req.params.businessId);
  if (!business) {
    throw new AppError('Business not found', 404);
  }

  business.compliance.kyc.videoConfirmation = {
    url,
    status: 'pending',
    verificationDate: new Date(),
    rejectReason: '',
    word,
  };
  business.compliance.kyc.lastUpdated = new Date();
  business.compliance.verificationStatus = 'in_progress';
  await business.save();

  res.status(200).json({
    status: 'success',
    message: 'Video confirmation submitted successfully',
    data: {
      videoConfirmation: business.compliance.kyc.videoConfirmation,
    },
  });
});

// Submit Proof of Address
export const submitProofOfAddress = catchAsync(async (req: Request, res: Response) => {
  const { document } = req.body;

  const business = await Business.findById(req.params.businessId);
  if (!business) {
    throw new AppError('Business not found', 404);
  }

  business.compliance.kyc.proofOfAddress = {
    document,
    status: 'pending',
    verificationDate: new Date(),
    rejectReason: '',
  };
  business.compliance.kyc.lastUpdated = new Date();
  business.compliance.verificationStatus = 'in_progress';
  await business.save();

  res.status(200).json({
    status: 'success',
    message: 'Proof of address submitted successfully',
    data: {
      proofOfAddress: business.compliance.kyc.proofOfAddress,
    },
  });
});

// Submit Certificate of Incorporation
export const submitCertificateOfIncorporation = catchAsync(async (req: Request, res: Response) => {
  const { document, licenseNumber } = req.body;

  const business = await Business.findById(req.params.businessId);
  if (!business) {
    throw new AppError('Business not found', 404);
  }

  business.compliance.kyc.certificateOfIncorporation = {
    document,
    status: 'pending',
    verificationDate: new Date(),
    rejectReason: '',
  };
  business.compliance.licenseNumber = licenseNumber;
  business.compliance.kyc.lastUpdated = new Date();
  business.compliance.verificationStatus = 'in_progress';
  await business.save();

  res.status(200).json({
    status: 'success',
    message: 'Certificate of incorporation submitted successfully',
    data: {
      certificateOfIncorporation: business.compliance.kyc.certificateOfIncorporation,
    },
  });
});

// Admin: Update KYC verification status
export const updateKycStatus = catchAsync(async (req: Request, res: Response) => {
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
  } = req.body;

  const business = await Business.findById(req.params.businessId);
  if (!business) {
    throw new AppError('Business not found', 404);
  }

  // Update individual statuses if provided
  if (personalInfoDocumentStatus) {
    business.compliance.kyc.personalInfoDocument.status = personalInfoDocumentStatus;
    if (personalInfoDocumentStatus === 'rejected') {
      business.compliance.kyc.personalInfoDocument.rejectReason = personalInfoDocumentReason;
    }
  }

  if (bvnStatus) {
    business.compliance.kyc.bvn.status = bvnStatus;
    if (bvnStatus === 'rejected') {
      business.compliance.kyc.bvn.rejectReason = bvnReason;
    }
  }

  if (videoConfirmationStatus) {
    business.compliance.kyc.videoConfirmation.status = videoConfirmationStatus;
    if (videoConfirmationStatus === 'rejected') {
      business.compliance.kyc.videoConfirmation.rejectReason = videoConfirmationReason;
    }
  }

  if (proofOfAddressStatus) {
    business.compliance.kyc.proofOfAddress.status = proofOfAddressStatus;
    if (proofOfAddressStatus === 'rejected') {
      business.compliance.kyc.proofOfAddress.rejectReason = proofOfAddressReason;
    }
  }

  if (certificateOfIncorporationStatus) {
    business.compliance.kyc.certificateOfIncorporation.status = certificateOfIncorporationStatus;
    if (certificateOfIncorporationStatus === 'rejected') {
      business.compliance.kyc.certificateOfIncorporation.rejectReason =
        certificateOfIncorporationReason;
    }
  }

  // Update overall KYC status
  const allVerified = [
    business.compliance.kyc.personalInfoDocument.status,
    business.compliance.kyc.bvn.status,
    business.compliance.kyc.videoConfirmation.status,
    business.compliance.kyc.proofOfAddress.status,
    business.compliance.kyc.certificateOfIncorporation.status,
  ].every((status) => status === 'verified');

  const anyRejected = [
    business.compliance.kyc.personalInfoDocument.status,
    business.compliance.kyc.bvn.status,
    business.compliance.kyc.videoConfirmation.status,
    business.compliance.kyc.proofOfAddress.status,
    business.compliance.kyc.certificateOfIncorporation.status,
  ].some((status) => status === 'rejected');

  const anyPending = [
    business.compliance.kyc.personalInfoDocument.status,
    business.compliance.kyc.bvn.status,
    business.compliance.kyc.videoConfirmation.status,
    business.compliance.kyc.proofOfAddress.status,
    business.compliance.kyc.certificateOfIncorporation.status,
  ].some((status) => status === 'pending');

  business.compliance.verificationStatus = allVerified
    ? 'completed'
    : anyRejected
      ? 'rejected'
      : anyPending
        ? 'in_progress'
        : 'not_submitted';
  business.compliance.kyc.lastUpdated = new Date();

  // Update verification status
  business.compliance.verificationStatus = allVerified
    ? 'completed'
    : anyRejected
      ? 'rejected'
      : anyPending
        ? 'in_progress'
        : 'not_submitted';

  await business.save();

  res.status(200).json({
    status: 'success',
    message: 'KYC status updated successfully',
    data: {
      kyc: business.compliance.kyc,
    },
  });
});
