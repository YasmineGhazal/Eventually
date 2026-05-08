import { Worker, Job } from 'bullmq';
import { config } from '../common/config';
import { JobModel } from '../jobs/job.model';
import { JOBS_QUEUE, JobStatus, JobType } from '../common/constants';
import { processImageResize } from './image-resize.worker';
import { processReportGenerate } from './report-generate.worker';

export function startWorkers(): Worker[] {
  const connection = { host: config.redisHost, port: config.redisPort };

  const worker = new Worker(
    JOBS_QUEUE,
    async (job: Job) => {
      if (job.name === JobType.IMAGE_RESIZE) return processImageResize(job);
      if (job.name === JobType.REPORT_GENERATE) return processReportGenerate(job);
    },
    { connection, concurrency: config.workerConcurrency },
  );

  worker.on('failed', async (job, err) => {
    if (!job) return;
    const { jobId } = job.data as { jobId: string };
    await JobModel.findByIdAndUpdate(jobId, {
      status: JobStatus.FAILED,
      error: err.message,
    });
  });

  return [worker];
}
