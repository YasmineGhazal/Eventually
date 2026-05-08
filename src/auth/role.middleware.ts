import { Request, Response, NextFunction } from 'express';
import { UserRole } from '../common/constants';
import { AuthRequest } from './auth.middleware';

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as AuthRequest).user;
    if (!user || !roles.includes(user.role)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    next();
  };
}
