import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { AuthService } from './auth.service';
import { UserModel } from './user.model';
import { JobsService } from '../jobs/jobs.service';
import { JobType } from '../common/constants';
import { jwtMiddleware, AuthRequest } from './auth.middleware';

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const adminRegisterSchema = credentialsSchema.extend({
  adminSecret: z.string().min(1),
});

const profileImageSchema = z.object({
  imageUrl: z.string().url(),
});

const authService = new AuthService();

export function createAuthRouter(jobsService: JobsService): Router {
  const router = Router();

  router.post('/register', async (req: Request, res: Response) => {
    const result = credentialsSchema.safeParse(req.body);
    if (!result.success) return res.status(400).json({ errors: result.error.errors });

    try {
      res.status(201).json(await authService.register(result.data.email, result.data.password));
    } catch (err: any) {
      res.status(err.status ?? 500).json({ message: err.message });
    }
  });

  router.post('/register-admin', async (req: Request, res: Response) => {
    const result = adminRegisterSchema.safeParse(req.body);
    if (!result.success) return res.status(400).json({ errors: result.error.errors });

    try {
      res.status(201).json(
        await authService.registerAdmin(result.data.email, result.data.password, result.data.adminSecret),
      );
    } catch (err: any) {
      res.status(err.status ?? 500).json({ message: err.message });
    }
  });

  router.post('/login', async (req: Request, res: Response) => {
    const result = credentialsSchema.safeParse(req.body);
    if (!result.success) return res.status(400).json({ errors: result.error.errors });

    try {
      res.status(200).json(await authService.login(result.data.email, result.data.password));
    } catch (err: any) {
      res.status(err.status ?? 500).json({ message: err.message });
    }
  });

  router.get('/me', jwtMiddleware, async (req: Request, res: Response) => {
    try {
      const { userId } = (req as AuthRequest).user;
      const user = await UserModel.findById(userId, 'email role profileImageUrl').lean();
      if (!user) return res.status(404).json({ message: 'User not found' });
      res.json(user);
    } catch (err: any) {
      res.status(err.status ?? 500).json({ message: err.message });
    }
  });

  router.post('/profile-image', jwtMiddleware, async (req: Request, res: Response) => {
    const result = profileImageSchema.safeParse(req.body);
    if (!result.success) return res.status(400).json({ errors: result.error.errors });

    try {
      const userId = (req as AuthRequest).user.userId;
      const { id } = await jobsService.create({
        type: JobType.IMAGE_RESIZE,
        payload: { userId, imageUrl: result.data.imageUrl, width: 200, height: 200 },
        createdBy: userId,
      });
      res.status(202).json({ jobId: id });
    } catch (err: any) {
      res.status(err.status ?? 500).json({ message: err.message });
    }
  });

  return router;
}
