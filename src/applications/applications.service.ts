import { ApplicationModel, IApplication } from './application.model';
import { ApplicationStatus } from '../common/constants';

interface ApplyDto {
  jobPostingId: string;
  userId: string;
  coverLetter: string;
  resumeUrl?: string;
  skills: string[];
}

interface PaginationQuery {
  index?: number;
  size?: number;
}

export class ApplicationsService {
  async apply(dto: ApplyDto): Promise<IApplication> {
    const existing = await ApplicationModel.findOne({
      jobPostingId: dto.jobPostingId,
      userId: dto.userId,
    });
    if (existing) throw Object.assign(new Error('Already applied to this posting'), { status: 409 });

    return ApplicationModel.create(dto);
  }

  async findByPosting(jobPostingId: string, query: PaginationQuery = {}) {
    const { index = 1, size = 20 } = query;
    const [data, total] = await Promise.all([
      ApplicationModel.find({ jobPostingId })
        .populate('userId', 'email')
        .sort({ createdAt: -1 })
        .skip((index - 1) * size)
        .limit(size),
      ApplicationModel.countDocuments({ jobPostingId }),
    ]);
    return { data, total, index, size };
  }

  async findByUser(userId: string, query: PaginationQuery = {}) {
    const { index = 1, size = 20 } = query;
    const [data, total] = await Promise.all([
      ApplicationModel.find({ userId })
        .populate('jobPostingId', 'title company status')
        .sort({ createdAt: -1 })
        .skip((index - 1) * size)
        .limit(size),
      ApplicationModel.countDocuments({ userId }),
    ]);
    return { data, total, index, size };
  }

  async updateStatus(id: string, status: ApplicationStatus): Promise<IApplication> {
    const application = await ApplicationModel.findByIdAndUpdate(id, { status }, { new: true });
    if (!application) throw Object.assign(new Error('Application not found'), { status: 404 });
    return application;
  }
}
