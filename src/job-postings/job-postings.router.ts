import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { JobPostingsService } from './job-postings.service';
import { ApplicationsService } from '../applications/applications.service';
import { JobsService } from '../jobs/jobs.service';
import { JobType, PostingStatus, PostingType, UserRole } from '../common/constants';
import { paginationSchema } from '../common/pagination';
import { requireRole } from '../auth/role.middleware';
import { AuthRequest } from '../auth/auth.middleware';

const createPostingSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  company: z.string().min(1),
  location: z.string().min(1),
  type: z.nativeEnum(PostingType),
  requiredSkills: z.array(z.string().min(1).trim()).optional().default([]),
});

const updatePostingSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  company: z.string().min(1).optional(),
  location: z.string().min(1).optional(),
  type: z.nativeEnum(PostingType).optional(),
  status: z.nativeEnum(PostingStatus).optional(),
  requiredSkills: z.array(z.string().min(1).trim()).optional(),
});

const listPostingsSchema = z.object({
  status: z.nativeEnum(PostingStatus).optional(),
  type: z.nativeEnum(PostingType).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).optional().default(20),
});

const applySchema = z.object({
  coverLetter: z.string().min(1),
  resumeUrl: z.string().url().optional(),
  skills: z.array(z.string().min(1).trim()).optional().default([]),
});

export function createJobPostingsRouter(
  postingsService: JobPostingsService,
  applicationsService: ApplicationsService,
  jobsService: JobsService,
): Router {
  const router = Router();

  router.post('/', requireRole(UserRole.ADMIN), async (req: Request, res: Response) => {
    const result = createPostingSchema.safeParse(req.body);
    if (!result.success) return res.status(400).json({ errors: result.error.errors });

    try {
      const postedBy = (req as AuthRequest).user.userId;
      const posting = await postingsService.create({ ...result.data, postedBy });
      res.status(201).json(posting);
    } catch (err: any) {
      res.status(err.status ?? 500).json({ message: err.message });
    }
  });

  router.get('/', async (req: Request, res: Response) => {
    const result = listPostingsSchema.safeParse(req.query);
    if (!result.success) return res.status(400).json({ errors: result.error.errors });

    try {
      res.json(await postingsService.findAll(result.data));
    } catch (err: any) {
      res.status(err.status ?? 500).json({ message: err.message });
    }
  });

  router.get('/:id', async (req: Request, res: Response) => {
    try {
      res.json(await postingsService.findOne(req.params.id));
    } catch (err: any) {
      res.status(err.status ?? 500).json({ message: err.message });
    }
  });

  router.patch('/:id', requireRole(UserRole.ADMIN), async (req: Request, res: Response) => {
    const result = updatePostingSchema.safeParse(req.body);
    if (!result.success) return res.status(400).json({ errors: result.error.errors });

    try {
      res.json(await postingsService.update(req.params.id, result.data));
    } catch (err: any) {
      res.status(err.status ?? 500).json({ message: err.message });
    }
  });

  router.delete('/:id', requireRole(UserRole.ADMIN), async (req: Request, res: Response) => {
    try {
      await postingsService.remove(req.params.id);
      res.status(204).send();
    } catch (err: any) {
      res.status(err.status ?? 500).json({ message: err.message });
    }
  });

  router.post('/:id/apply', requireRole(UserRole.USER), async (req: Request, res: Response) => {
    const result = applySchema.safeParse(req.body);
    if (!result.success) return res.status(400).json({ errors: result.error.errors });

    try {
      await postingsService.findOne(req.params.id);
      const userId = (req as AuthRequest).user.userId;
      const application = await applicationsService.apply({
        jobPostingId: req.params.id,
        userId,
        ...result.data,
      });
      res.status(201).json(application);
    } catch (err: any) {
      res.status(err.status ?? 500).json({ message: err.message });
    }
  });

  router.get('/:id/applications', requireRole(UserRole.ADMIN), async (req: Request, res: Response) => {
    const pagination = paginationSchema.safeParse(req.query);
    if (!pagination.success) return res.status(400).json({ errors: pagination.error.errors });

    try {
      res.json(await applicationsService.findByPosting(req.params.id, pagination.data));
    } catch (err: any) {
      res.status(err.status ?? 500).json({ message: err.message });
    }
  });

  router.post('/:id/skills-report', requireRole(UserRole.ADMIN), async (req: Request, res: Response) => {
    try {
      await postingsService.findOne(req.params.id);
      const adminId = (req as AuthRequest).user.userId;
      const { id } = await jobsService.create({
        type: JobType.REPORT_GENERATE,
        payload: { jobPostingId: req.params.id },
        createdBy: adminId,
      });
      res.status(202).json({ jobId: id });
    } catch (err: any) {
      res.status(err.status ?? 500).json({ message: err.message });
    }
  });

  return router;
}
