import express from 'express';
import { sendOTP, verifyOTP } from '../controllers/otp.controller';

const router = express.Router();

// Public routes
router.post('/send', sendOTP);
router.post('/verify', verifyOTP);

export default router;
