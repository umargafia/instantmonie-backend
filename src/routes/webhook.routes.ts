import express from 'express';
import * as authController from '../controllers/auth.controller';

import {
  getWebhookActivities,
  getWebhookActivity,
  getWebhookStats,
  getAllWebhookActivities,
  handlePaymentNotification,
} from '@/controllers/webhook.controller';

const router = express.Router();

router.post('/payment/notification', handlePaymentNotification);
// Protect all routes
router.use(authController.protect);

// Get webhook activities
router.get('/activities/:businessId', getWebhookActivities);

// Get webhook activity details
router.get('/activities/:id', getWebhookActivity);

// Get webhook statistics
router.get('/stats', getWebhookStats);

router.use(authController.restrictTo('admin'));
router.get('/all', getAllWebhookActivities);
export default router;
