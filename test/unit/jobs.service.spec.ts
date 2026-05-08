import { Queue } from 'bullmq';
import { JobsService } from '../../src/jobs/jobs.service';
import { JobStatus, JobType } from '../../src/common/constants';

jest.mock('../../src/jobs/job.model', () => ({
  JobModel: {
    create: jest.fn(),
    findById: jest.fn(),
    find: jest.fn(),
    countDocuments: jest.fn(),
  },
}));

import { JobModel } from '../../src/jobs/job.model';

const mockJobId = '507f1f77bcf86cd799439011';
const mockJobRecord = {
  _id: { toString: () => mockJobId },
  type: JobType.IMAGE_RESIZE,
  status: JobStatus.PENDING,
  payload: { imageUrl: 'http://example.com/img.jpg', width: 100, height: 100 },
};

const mockQueue = { add: jest.fn() } as unknown as Queue;

describe('JobsService', () => {
  let service: JobsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new JobsService(mockQueue);
    (mockQueue.add as jest.Mock).mockResolvedValue({});
  });

  describe('create', () => {
    it('saves the job and enqueues it', async () => {
      (JobModel.create as jest.Mock).mockResolvedValue(mockJobRecord);

      const result = await service.create({
        type: JobType.IMAGE_RESIZE,
        payload: { imageUrl: 'http://example.com/img.jpg', width: 100, height: 100 },
        createdBy: 'user123',
      });

      expect(JobModel.create).toHaveBeenCalledWith({
        type: JobType.IMAGE_RESIZE,
        payload: { imageUrl: 'http://example.com/img.jpg', width: 100, height: 100 },
        createdBy: 'user123',
      });
      expect(mockQueue.add).toHaveBeenCalledWith(
        JobType.IMAGE_RESIZE,
        expect.objectContaining({ jobId: mockJobId }),
        expect.objectContaining({ attempts: 3 }),
      );
      expect(result).toEqual({ id: mockJobId });
    });
  });

  describe('findOne', () => {
    it('returns the job when found', async () => {
      (JobModel.findById as jest.Mock).mockResolvedValue(mockJobRecord);
      const result = await service.findOne(mockJobId);
      expect(result).toBe(mockJobRecord);
    });

    it('throws a 404 error when job does not exist', async () => {
      (JobModel.findById as jest.Mock).mockResolvedValue(null);
      await expect(service.findOne('nonexistent')).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('findAll', () => {
    it('returns paginated results', async () => {
      (JobModel.find as jest.Mock).mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([mockJobRecord]),
      });
      (JobModel.countDocuments as jest.Mock).mockResolvedValue(1);

      const result = await service.findAll({ status: JobStatus.PENDING, page: 1, limit: 10 });

      expect(result).toMatchObject({ total: 1, page: 1, limit: 10 });
      expect(result.data).toHaveLength(1);
    });
  });
});
