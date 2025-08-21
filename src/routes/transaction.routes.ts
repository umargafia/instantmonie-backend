import { Router } from 'express';

import {
  getBussinessTransactions,
  getTransactionDetails,
  searchTransactions,
} from '@/controllers/transaction.controller';
import { protect } from '@/controllers/auth.controller';

const router = Router();

router.use(protect);
router.get('/business/:businessId', getBussinessTransactions);
router.get('/:transactionId', getTransactionDetails);
router.get('/search', searchTransactions);

export default router;
