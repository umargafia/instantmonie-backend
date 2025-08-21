import express from 'express';
import * as userController from '../controllers/user.controllers';
import { protect, restrictTo } from '../middleware/auth.middleware';

const router = express.Router();

// Protect all user routes
router.use(protect);

// Get user statistics
router.get('/stats', userController.getUserStats);

// Get all users with filtering and pagination
router.get('/', userController.getAllUsers);

// Create new user
router.post('/', restrictTo('super_admin'), userController.createUser);

// Get single user
router.get('/:id', userController.getUser);

// Update user
router.patch('/:id', restrictTo('super_admin'), userController.updateUser);

// Delete user
router.delete('/:id', restrictTo('super_admin'), userController.deleteUser);

// Update user status
router.patch('/:id/status', restrictTo('super_admin'), userController.updateUserStatus);

// Reset user password
router.post('/:id/reset-password', restrictTo('super_admin'), userController.resetUserPassword);

// Get user activity logs
router.get('/:id/activity', userController.getUserActivity);

// Get user security logs
router.get('/:id/security-logs', userController.getUserSecurityLogs);

export default router;
