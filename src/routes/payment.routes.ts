import express from 'express';

import {
  receivePayment,
  queryMerchantBalance,
  getBankList,
  verifyBankAccount,
  queryPalmPayAccount,
  initiatePayment,
  checkWithdrawalStatus,
} from '@/controllers/payment.controller';
import { protect } from '@/controllers/auth.controller';

const router = express.Router();

router.post('/receive-payment', receivePayment);

router.use(protect);
router.get('/balance', queryMerchantBalance);
router.get('/bank-list', getBankList);
router.post('/verify-bank-account', verifyBankAccount);
router.post('/query-palmpay-account', queryPalmPayAccount);
router.post('/initiate-payment', initiatePayment);
router.get('/withdrawal-status/:transactionId', checkWithdrawalStatus);
router.get('/withdrawal-status/order/:orderId', checkWithdrawalStatus);

export default router;
