import express from 'express';

import { protect } from '../controllers/auth.controller';
import {
  createBusiness,
  getBusiness,
  getBusinessById,
  updateBusiness,
  resetKeys,
  saveBussinessAccountDetails,
} from '../controllers/bussiness.controller';
import { getBusinessStats } from '../controllers/stats.controller';

const router = express.Router();

router.use(protect);

router.post('/create', createBusiness);
router.get('/', getBusiness);
router.get('/:id', getBusinessById);
router.get('/:id/stats', getBusinessStats);
router.put('/:id', updateBusiness);
router.post('/reset/keys/:id', resetKeys);
router.post('/account/details', saveBussinessAccountDetails);
export default router;
