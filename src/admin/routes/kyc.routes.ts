import express from 'express';
import * as kycController from '../controllers/kyc.controllers';
import { protect, restrictTo } from '../middleware/auth.middleware';

const router = express.Router();

// Protect all KYC routes
router.use(protect);

// Get KYC statistics
router.get('/stats', kycController.getKYCStats);

// Get all KYC applications with filtering and pagination
router.get('/', kycController.getAllKYC);

// Get single KYC application
router.get('/:id', kycController.getKYC);

// Update KYC document status (super_admin only)
router.patch('/:id/review', kycController.updateKYCStatus);

export default router;
