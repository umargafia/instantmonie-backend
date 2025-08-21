import express from 'express';
import { protectApi } from '../controllers/apiAuth.controller';
import {
  createAccountNumber,
  getAccountNumber,
  initiatePayment,
} from '../controllers/api.controller';
import { getBankList } from '@/controllers/payment.controller';

const router = express.Router();

// All routes are protected with API key and signature validation
router.use(protectApi);

router.post('/account/generate', createAccountNumber);
router.get('/account/list', getAccountNumber);
router.post('/payment/withdraw', initiatePayment);
router.get('/bank/list', getBankList);

// Payment notification route (no API key protection needed as it's from PalmPay)

export default router;
