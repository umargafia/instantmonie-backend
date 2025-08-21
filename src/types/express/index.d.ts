import { Request } from 'express';
import { Business } from '@/models/bussiness.model';

declare global {
  namespace Express {
    interface Request {
      requestTime?: string;
      business?: Business;
    }
  }
}
