import { Router } from 'express';
import {
  getLogs,
  getLogMetadata,
  getUserSecurityLogs,
  clearLogs,
} from '../controllers/log.controller';
import { protect, restrictTo } from '../controllers/auth.controller';

const router = Router();

// Protect all routes - admin only
router.use(protect);
router.use(restrictTo('admin'));

// Log metadata for filter options
router.get('/metadata', getLogMetadata);

// Log management routes
router.get('/', getLogs);
router.post('/clear', clearLogs);

// User security logs
router.get('/user/:userId', getUserSecurityLogs);

export default router;
