import express from 'express';
import * as dashboardController from '../controllers/dashboard.controllers';
import { protect, restrictTo } from '../middleware/auth.middleware';

const router = express.Router();

// Protect all dashboard routes
router.use(protect);

// Get dashboard statistics
router.get('/stats', dashboardController.getPlatformStats);

// Get recent transactions
router.get('/transactions/recent', dashboardController.getRecentTransactions);

// Get recent KYC applications
router.get('/kyc/recent', dashboardController.getRecentKyc);

// Get transaction trends
router.get('/transactions/trends', dashboardController.getTransactionTrends);

// Get revenue distribution
router.get('/revenue/distribution', dashboardController.getRevenueDistribution);

// Get user growth
router.get('/users/growth', dashboardController.getUserGrowth);

export default router;
