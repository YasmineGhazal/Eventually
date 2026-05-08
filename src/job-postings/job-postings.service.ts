import { JobPostingModel, IJobPosting } from './job-posting.model';
import { PostingStatus, PostingType } from '../common/constants';

interface CreatePostingDto {
  title: string;
  description: string;
  company: string;
  location: string;
  type: PostingType;
  requiredSkills: string[];
  postedBy: string;
}

interface UpdatePostingDto {
  title?: string;
  description?: string;
  company?: string;
  location?: string;
  type?: PostingType;
  status?: PostingStatus;
  requiredSkills?: string[];
}

interface ListPostingsQuery {
  status?: PostingStatus;
  type?: PostingType;
  page?: number;
  limit?: number;
}

export class JobPostingsService {
  async create(dto: CreatePostingDto): Promise<IJobPosting> {
    return JobPostingModel.create(dto);
  }

  async findAll(query: ListPostingsQuery) {
    const { status, type, page = 1, limit = 20 } = query;
    const filter: Record<string, unknown> = {};
    if (status) filter.status = status;
    if (type) filter.type = type;

    const [data, total] = await Promise.all([
      JobPostingModel.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      JobPostingModel.countDocuments(filter),
    ]);

    return { data, total, page, limit };
  }

  async findOne(id: string): Promise<IJobPosting> {
    const posting = await JobPostingModel.findById(id);
    if (!posting) throw Object.assign(new Error('Job posting not found'), { status: 404 });
    return posting;
  }

  async update(id: string, dto: UpdatePostingDto): Promise<IJobPosting> {
    const posting = await JobPostingModel.findByIdAndUpdate(id, dto, { new: true });
    if (!posting) throw Object.assign(new Error('Job posting not found'), { status: 404 });
    return posting;
  }

  async remove(id: string): Promise<void> {
    const posting = await JobPostingModel.findByIdAndDelete(id);
    if (!posting) throw Object.assign(new Error('Job posting not found'), { status: 404 });
  }
}
