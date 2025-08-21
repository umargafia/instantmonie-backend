import { Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '@/config/env';
import { IAdmin } from '@/admin/modules/admin.model';
import { Document, Types } from 'mongoose';

const signToken = (id: string) => {
  return jwt.sign({ id }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  });
};

export const createSendToken = (
  admin: Document & IAdmin & { _id: Types.ObjectId },
  statusCode: number,
  res: Response
) => {
  const token = signToken(admin._id.toString());

  // Remove password from output
  const adminResponse = admin.toObject();
  delete (adminResponse as any).password;

  res.status(statusCode).json({
    status: 'success',
    token,
    data: adminResponse,
  });
};
