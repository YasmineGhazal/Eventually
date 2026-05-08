import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { JobsService } from './jobs.service';
import { JobStatus, JobType, UserRole } from '../common/constants';
import { requireRole } from '../auth/role.middleware';
import { AuthRequest } from '../auth/auth.middleware';

const createJobSchema = z.object({
  type: z.nativeEnum(JobType),
  payload: z.record(z.unknown()),
});

const listJobsSchema = z.object({
  status: z.nativeEnum(JobStatus).optional(),
  type: z.nativeEnum(JobType).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).optional().default(20),
});

export function createJobsRouter(jobsService: JobsService): Router {
  const router = Router();

  router.post('/', requireRole(UserRole.ADMIN), async (req: Request, res: Response) => {
    const result = createJobSchema.safeParse(req.body);
    if (!result.success) return res.status(400).json({ errors: result.error.errors });

    try {
      const { userId } = (req as AuthRequest).user;
      const job = await jobsService.create({ ...result.data, createdBy: userId });
      res.status(201).json(job);
    } catch (err: any) {
      res.status(err.status ?? 500).json({ message: err.message });
    }
  });

  router.get('/', async (req: Request, res: Response) => {
    const result = listJobsSchema.safeParse(req.query);
    if (!result.success) return res.status(400).json({ errors: result.error.errors });

    try {
      const { userId, role } = (req as AuthRequest).user;
      const filter = { ...result.data, ...(role !== UserRole.ADMIN && { createdBy: userId }) };
      const jobs = await jobsService.findAll(filter);
      res.json(jobs);
    } catch (err: any) {
      res.status(err.status ?? 500).json({ message: err.message });
    }
  });

  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const { userId, role } = (req as AuthRequest).user;
      const job = await jobsService.findOne(req.params.id);
      if (role !== UserRole.ADMIN && job.createdBy?.toString() !== userId) {
        return res.status(403).json({ message: 'Forbidden' });
      }
      res.json(job);
    } catch (err: any) {
      res.status(err.status ?? 500).json({ message: err.message });
    }
  });

  router.get('/:id/download', requireRole(UserRole.ADMIN), async (req: Request, res: Response) => {
    try {
      const job = await jobsService.findOne(req.params.id);

      if (job.status !== JobStatus.COMPLETED) {
        return res.status(409).json({ message: `Job is ${job.status}, not completed` });
      }

      const result = job.result as Record<string, unknown> | undefined;
      if (!result?.csv || typeof result.csv !== 'string') {
        return res.status(400).json({ message: 'This job has no downloadable CSV' });
      }

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="report-${req.params.id}.csv"`);
      res.send(result.csv);
    } catch (err: any) {
      res.status(err.status ?? 500).json({ message: err.message });
    }
  });

  return router;
}
