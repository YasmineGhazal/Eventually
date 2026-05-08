import { Queue } from 'bullmq';
import { JobModel } from './job.model';
import { JobStatus, JobType, JOBS_QUEUE } from '../common/constants';

interface CreateJobDto {
  type: JobType;
  payload: Record<string, unknown>;
  createdBy: string;
}

interface ListJobsQuery {
  status?: JobStatus;
  type?: JobType;
  page?: number;
  limit?: number;
  createdBy?: string;
}

export class JobsService {
  constructor(private queue: Queue) {}

  async create(dto: CreateJobDto) {
    const job = await JobModel.create({ type: dto.type, payload: dto.payload, createdBy: dto.createdBy });
    const id = job._id.toString();
    await this.queue.add(dto.type, { jobId: id, payload: dto.payload }, {
      jobId: id,
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
    });
    return { id };
  }

  async findOne(id: string) {
    const job = await JobModel.findById(id);
    if (!job) throw Object.assign(new Error(`Job ${id} not found`), { status: 404 });
    return job;
  }

  async findAll(query: ListJobsQuery) {
    const { status, type, page = 1, limit = 20, createdBy } = query;
    const filter: Record<string, unknown> = {};
    if (status) filter.status = status;
    if (type) filter.type = type;
    if (createdBy) filter.createdBy = createdBy;

    const [data, total] = await Promise.all([
      JobModel.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      JobModel.countDocuments(filter),
    ]);

    return { data, total, page, limit };
  }
}
