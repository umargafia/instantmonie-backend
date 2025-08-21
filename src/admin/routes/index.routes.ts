import express from 'express';
import adminRoutes from './admin.routes';
import dashboardRoutes from './dashboard.routes';
import userRoutes from './user.routes';
import transactionRoutes from './transaction.routes';
import kycRoutes from './kyc.routes';
import businessRoutes from './business.routes';

const router = express.Router();

// Mount admin routes
router.use('/admin', adminRoutes);

// Mount dashboard routes
router.use('/dashboard', dashboardRoutes);

// Mount user routes
router.use('/users', userRoutes);

// Mount transaction routes
router.use('/transactions', transactionRoutes);

// Mount KYC routes
router.use('/kyc', kycRoutes);

// Mount business routes
router.use('/business', businessRoutes);

export default router;
