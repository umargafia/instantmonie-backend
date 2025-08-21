import express from 'express';
import * as adminController from '../controllers/admin.controllers';
import { protect, restrictTo } from '@/admin/middleware/auth.middleware';

const router = express.Router();

// Public routes

router.post('/login', adminController.login);
router.get('/logout', adminController.logout);

// Protected routes - require authentication
router.use(protect);

// Routes for all authenticated admins
router.get('/me', adminController.getMe);
router.patch('/updateMe', adminController.updateMe);
router.patch('/updateMyPassword', adminController.updatePassword);

// Super admin only routes
router.use(restrictTo('super_admin'));

router.route('/').get(adminController.getAllAdmins).post(adminController.createAdmin);

router
  .route('/:id')
  .get(adminController.getAdmin)
  .patch(adminController.updateAdmin)
  .delete(adminController.deleteAdmin);

router.patch('/:id/deactivate', adminController.deactivateAdmin);
router.patch('/:id/activate', adminController.activateAdmin);
router.post('/create', adminController.createAdmin);

export default router;
