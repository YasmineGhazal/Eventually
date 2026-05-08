import express from 'express';
import { Queue } from 'bullmq';
import { config } from './common/config';
import { JOBS_QUEUE } from './common/constants';
import { createAuthRouter } from './auth/auth.router';
import { jwtMiddleware } from './auth/auth.middleware';
import { createJobsRouter } from './jobs/jobs.router';
import { JobsService } from './jobs/jobs.service';
import { createJobPostingsRouter } from './job-postings/job-postings.router';
import { JobPostingsService } from './job-postings/job-postings.service';
import { createApplicationsRouter } from './applications/applications.router';
import { ApplicationsService } from './applications/applications.service';

export function createApp(queue?: Queue) {
  const app = express();
  app.use(express.json());

  const resolvedQueue = queue ?? new Queue(JOBS_QUEUE, {
    connection: { host: config.redisHost, port: config.redisPort },
  });

  const jobsService = new JobsService(resolvedQueue);
  const postingsService = new JobPostingsService();
  const applicationsService = new ApplicationsService();

  app.use('/auth', createAuthRouter(jobsService));
  app.use('/jobs', jwtMiddleware, createJobsRouter(jobsService));
  app.use('/job-postings', jwtMiddleware, createJobPostingsRouter(postingsService, applicationsService, jobsService));
  app.use('/applications', jwtMiddleware, createApplicationsRouter(applicationsService));

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ message: err.message });
  });

  return app;
}
