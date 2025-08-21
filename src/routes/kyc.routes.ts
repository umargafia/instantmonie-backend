import express from 'express';
import {
  getKycStatus,
  submitBusinessInformation,
  submitPersonalInfoDocument,
  submitBVN,
  submitVideoConfirmation,
  submitProofOfAddress,
  submitCertificateOfIncorporation,
  updateKycStatus,
} from '@/controllers/kyc.controller';
import { protect, restrictTo } from '@/middleware/authMiddleware';

const router = express.Router();

// Protect all routes
router.use(protect);

// Get KYC status
router.get('/:businessId', getKycStatus);

// Submit business information
router.post('/:businessId/business-info', submitBusinessInformation);

// Submit KYC documents
router.post('/:businessId/personal-info', submitPersonalInfoDocument);
router.post('/:businessId/bvn', submitBVN);
router.post('/:businessId/video', submitVideoConfirmation);
router.post('/:businessId/proof-of-address', submitProofOfAddress);
router.post('/:businessId/certificate', submitCertificateOfIncorporation);

// Admin only routes
router.patch('/:businessId/status', restrictTo('admin'), updateKycStatus);

export default router;
