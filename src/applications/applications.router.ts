import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { ApplicationsService } from './applications.service';
import { ApplicationStatus, UserRole } from '../common/constants';
import { paginationSchema } from '../common/pagination';
import { requireRole } from '../auth/role.middleware';
import { AuthRequest } from '../auth/auth.middleware';

const updateStatusSchema = z.object({
  status: z.nativeEnum(ApplicationStatus),
});

export function createApplicationsRouter(applicationsService: ApplicationsService): Router {
  const router = Router();

  router.get('/mine', async (req: Request, res: Response) => {
    const pagination = paginationSchema.safeParse(req.query);
    if (!pagination.success) return res.status(400).json({ errors: pagination.error.errors });

    try {
      const userId = (req as AuthRequest).user.userId;
      res.json(await applicationsService.findByUser(userId, pagination.data));
    } catch (err: any) {
      res.status(err.status ?? 500).json({ message: err.message });
    }
  });

  router.patch('/:id/status', requireRole(UserRole.ADMIN), async (req: Request, res: Response) => {
    const result = updateStatusSchema.safeParse(req.body);
    if (!result.success) return res.status(400).json({ errors: result.error.errors });

    try {
      res.json(await applicationsService.updateStatus(req.params.id, result.data.status));
    } catch (err: any) {
      res.status(err.status ?? 500).json({ message: err.message });
    }
  });

  return router;
}
