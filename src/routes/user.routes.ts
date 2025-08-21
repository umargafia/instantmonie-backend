import express from 'express';
import * as userController from '../controllers/user.controller';
import * as authController from '../controllers/auth.controller';

const router = express.Router();

router.post('/signup', authController.signup);
router.post('/login', authController.login);
router.post('/forgotPassword', authController.forgotPassword);
router.patch('/resetPassword/:token', authController.resetPassword);
router.get('/logout', authController.logout);

// Protect all routes after this middleware
router.use(authController.protect);

router.patch('/updateMyPassword', authController.updatePassword);
router.get('/me', userController.getMe, userController.getUser);
router.patch('/updateMe', userController.updateMe);
router.delete('/deleteMe', userController.deleteMe);

// Session management
router.post('/terminateSession', authController.terminateSession);
router.get('/activeSessions', authController.getActiveSessions);

// Admin-only routes
router.use(authController.restrictTo('admin'));

// Admin can terminate any user's session
router.post('/terminateSession/:userId', authController.terminateSession);

router.route('/').get(userController.getAllUsers).post(userController.createUser);

router
  .route('/:id')
  .get(userController.getUser)
  .patch(userController.updateUser)
  .delete(userController.deleteUser);

export default router;
