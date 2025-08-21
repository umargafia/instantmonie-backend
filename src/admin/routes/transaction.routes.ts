import express from 'express';
import * as transactionController from '../controllers/transaction.controllers';
import { protect, restrictTo } from '../middleware/auth.middleware';

const router = express.Router();

// Protect all transaction routes
router.use(protect);

// Get transaction statistics
router.get('/stats', transactionController.getTransactionStats);

// Get business transaction analytics
router.get('/business/:id/analytics', transactionController.getBusinessTransactionAnalytics);

// Get all transactions with filtering and pagination
router.get('/', transactionController.getAllTransactions);

// Get single transaction
router.get('/:id', transactionController.getTransaction);

// Update transaction status (super_admin only)
router.patch(
  '/:id/status',
  restrictTo('super_admin'),
  transactionController.updateTransactionStatus
);

export default router;
