import { Router } from 'express';
import {
  generateAccountNumber,
  getAccountNumbers,
  getAccountNumberById,
  validateAccountNumber,
  searchAccountNumbers,
} from '@/controllers/accountNumber.controller';
import { protect } from '@/controllers/auth.controller';

const router = Router();

// Protect all routes
router.use(protect);

router.post('/', generateAccountNumber);
router.get('/business/:id', getAccountNumbers);
router.get('/:id', getAccountNumberById);
router.post('/validate', validateAccountNumber);

// Search account numbers
router.get('/search', searchAccountNumbers);

export default router;
