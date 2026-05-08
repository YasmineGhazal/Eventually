import { Request, Response, NextFunction } from 'express';
import * as jwt from 'jsonwebtoken';
import { config } from '../common/config';
import { UserRole } from '../common/constants';
import { UserModel } from './user.model';

export interface AuthRequest extends Request {
  user: { userId: string; email: string; role: UserRole };
}

export async function jwtMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, config.jwtSecret) as { sub: string; email: string; role: UserRole; tv: number };

    const user = await UserModel.findById(payload.sub, 'tokenVersion').lean();
    if (!user || user.tokenVersion !== payload.tv) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    (req as AuthRequest).user = { userId: payload.sub, email: payload.email, role: payload.role };
    next();
  } catch {
    return res.status(401).json({ message: 'Unauthorized' });
  }
}
