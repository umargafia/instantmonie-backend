import express from 'express';
import * as businessController from '../controllers/business.controllers';
import { protect, restrictTo } from '../middleware/auth.middleware';

const router = express.Router();

// Protect all routes
router.use(protect);

// Get business statistics
router.get('/stats', businessController.getBusinessStats);

// Get all businesses with filtering and pagination
router.get('/', businessController.getAllBusinesses);

// Get a single business
router.get('/:id', businessController.getBusiness);

// Get business transactions
router.get('/:id/transactions', businessController.getBusinessTransactions);

// Get business activity logs
router.get('/:id/activity', businessController.getBusinessActivity);

// Get business analytics
router.get('/:id/analytics', businessController.getBusinessAnalytics);

// Update business charges
router.patch('/:id/charges', businessController.updateBusinessCharges);

// Update business status (restricted to super_admin)
router.patch('/:id/status', restrictTo('super_admin'), businessController.updateBusinessStatus);

export default router;
