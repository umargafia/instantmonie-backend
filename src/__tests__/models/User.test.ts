import mongoose from 'mongoose';
import { User } from '../../models/user.model';
import { createTestUser, setupTestDB } from '../../test/setup';

setupTestDB();

describe('User Model', () => {
  it('should create a new user', async () => {
    const userData = {
      name: 'John Doe',
      email: 'john@example.com',
      password: 'password123',
      passwordConfirm: 'password123',
      username: 'johndoe',
      phone: '+1234567890',
    };

    const user = await User.create(userData);
    expect(user._id).toBeDefined();
    expect(user.email).toBe(userData.email);
    expect(user.username).toBe(userData.username);
    expect(user.phone).toBe(userData.phone);
  });

  it('should not create user with invalid email', async () => {
    const userData = {
      name: 'John Doe',
      email: 'invalid-email',
      password: 'password123',
      passwordConfirm: 'password123',
      username: 'johndoe',
      phone: '+1234567890',
    };

    await expect(User.create(userData)).rejects.toThrow();
  });

  it('should not create user with mismatched passwords', async () => {
    const userData = {
      name: 'John Doe',
      email: 'john@example.com',
      password: 'password123',
      passwordConfirm: 'different',
      username: 'johndoe',
      phone: '+1234567890',
    };

    await expect(User.create(userData)).rejects.toThrow();
  });

  it('should hash password before saving', async () => {
    const userData = {
      name: 'John Doe',
      email: 'john@example.com',
      password: 'password123',
      passwordConfirm: 'password123',
      username: 'johndoe',
      phone: '+1234567890',
    };

    const user = await User.create(userData);
    expect(user.password).not.toBe(userData.password);
    expect(user.password).toBeDefined();
  });

  it('should update passwordChangedAt when password is changed', async () => {
    const user = await createTestUser();
    const originalPasswordChangedAt = user.passwordChangedAt;

    user.password = 'newpassword123';
    user.passwordConfirm = 'newpassword123';
    await user.save();

    expect(user.passwordChangedAt).toBeDefined();
    expect(user.passwordChangedAt).not.toBe(originalPasswordChangedAt);
  });

  it('should create password reset token', async () => {
    const user = await createTestUser();
    const resetToken = user.createPasswordResetToken();
    await user.save({ validateBeforeSave: false });

    expect(user.passwordResetToken).toBeDefined();
    expect(user.passwordResetExpires).toBeDefined();
  });

  it('should correctly validate password', async () => {
    const user = await createTestUser();
    const isValid = await user.correctPassword('password123', user.password);
    expect(isValid).toBe(true);
  });

  it('should check if password was changed after token was issued', async () => {
    const user = await createTestUser();
    const resetToken = user.createPasswordResetToken();
    await user.save({ validateBeforeSave: false });

    const tokenTimestamp = user.passwordResetExpires?.getTime();
    if (!tokenTimestamp) {
      throw new Error('Password reset token timestamp is undefined');
    }
    const passwordChangedAt = new Date(tokenTimestamp - 1000);

    user.passwordChangedAt = passwordChangedAt;
    await user.save();

    const hasChanged = user.changedPasswordAfter(tokenTimestamp);
    expect(hasChanged).toBe(true);
  });
});
