import mongoose from 'mongoose';
import request from 'supertest';
import app from '../../app';
import { createTestUser } from '../../test/setup';
import { User } from '../../models/user.model';
import { AuthService } from '../../services/authService';

describe('User Controller', () => {
  describe('GET /api/v1/users', () => {
    it('should get all users when admin', async () => {
      const admin = await createTestUser('admin');
      const token = AuthService.signToken(admin._id.toString());

      const response = await request(app)
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.status).toBe('success');
      expect(Array.isArray(response.body.data.users)).toBe(true);
    });

    it('should not get all users when not admin', async () => {
      const user = await createTestUser('user');
      const token = AuthService.signToken(user._id.toString());

      await request(app).get('/api/v1/users').set('Authorization', `Bearer ${token}`).expect(403);
    });

    it('should not get all users when not authenticated', async () => {
      await request(app).get('/api/v1/users').expect(401);
    });
  });

  describe('GET /api/v1/users/:id', () => {
    it('should get user by id when admin', async () => {
      const admin = await createTestUser('admin');
      const user = await createTestUser('user');
      const token = AuthService.signToken(admin._id.toString());

      const response = await request(app)
        .get(`/api/v1/users/${user._id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.status).toBe('success');
      expect(response.body.data.user._id.toString()).toBe(user._id.toString());
    });

    it('should not get user by id when not admin', async () => {
      const user = await createTestUser('user');
      const otherUser = await createTestUser('user');
      const token = AuthService.signToken(user._id.toString());

      await request(app)
        .get(`/api/v1/users/${otherUser._id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    it('should return 404 for non-existent user', async () => {
      const admin = await createTestUser('admin');
      const token = AuthService.signToken(admin._id.toString());

      await request(app)
        .get('/api/v1/users/507f1f77bcf86cd799439011')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });

  describe('PATCH /api/v1/users/:id', () => {
    it('should update user when admin', async () => {
      const admin = await createTestUser('admin');
      const user = await createTestUser('user');
      const token = AuthService.signToken(admin._id.toString());

      const response = await request(app)
        .patch(`/api/v1/users/${user._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Updated Name',
        })
        .expect(200);

      expect(response.body.status).toBe('success');
      expect(response.body.data.user.name).toBe('Updated Name');
    });

    it('should not update user when not admin', async () => {
      const user = await createTestUser('user');
      const otherUser = await createTestUser('user');
      const token = AuthService.signToken(user._id.toString());

      await request(app)
        .patch(`/api/v1/users/${otherUser._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Updated Name',
        })
        .expect(403);
    });
  });

  describe('DELETE /api/v1/users/:id', () => {
    it('should delete user when admin', async () => {
      const admin = await createTestUser('admin');
      const user = await createTestUser('user');
      const token = AuthService.signToken(admin._id.toString());

      await request(app)
        .delete(`/api/v1/users/${user._id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(204);

      const deletedUser = await User.findById(user._id);
      expect(deletedUser).toBeNull();
    });

    it('should not delete user when not admin', async () => {
      const user = await createTestUser('user');
      const otherUser = await createTestUser('user');
      const token = AuthService.signToken(user._id.toString());

      await request(app)
        .delete(`/api/v1/users/${otherUser._id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(403);

      const existingUser = await User.findById(user._id);
      expect(existingUser).toBeDefined();
    });
  });

  describe('GET /api/v1/users/me', () => {
    it('should get current user', async () => {
      const user = await createTestUser('user');
      const token = AuthService.signToken(user._id.toString());

      const response = await request(app)
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.status).toBe('success');
      expect(response.body.data.user._id.toString()).toBe(user._id.toString());
    });

    it('should not get current user when not authenticated', async () => {
      await request(app).get('/api/v1/users/me').expect(401);
    });
  });

  describe('PATCH /api/v1/users/updateMe', () => {
    it('should update current user', async () => {
      const user = await createTestUser();
      const token = AuthService.signToken(user._id.toString());

      const response = await request(app)
        .patch('/api/v1/users/updateMe')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Updated Name',
        })
        .expect(200);

      expect(response.body.status).toBe('success');
      expect(response.body.data.user.name).toBe('Updated Name');
    });

    it('should not update password through this route', async () => {
      const user = await createTestUser();
      const token = AuthService.signToken(user._id.toString());

      await request(app)
        .patch('/api/v1/users/updateMe')
        .set('Authorization', `Bearer ${token}`)
        .send({
          password: 'newpassword123',
          passwordConfirm: 'newpassword123',
        })
        .expect(400);
    });
  });

  describe('DELETE /api/v1/users/deleteMe', () => {
    it('should deactivate current user', async () => {
      const user = await createTestUser('user');
      const token = AuthService.signToken(user._id.toString());

      const response = await request(app)
        .delete('/api/v1/users/deleteMe')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.status).toBe('success');
      expect(response.body.data.user.active).toBe(false);
    });

    it('should not deactivate user when not authenticated', async () => {
      await request(app).delete('/api/v1/users/deleteMe').expect(401);
    });
  });
});
