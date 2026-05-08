import { Job } from 'bullmq';
import { processImageResize } from '../../src/workers/image-resize.worker';
import { JobStatus } from '../../src/common/constants';

jest.mock('axios');
jest.mock('sharp');
jest.mock('../../src/jobs/job.model', () => ({
  JobModel: { findByIdAndUpdate: jest.fn().mockResolvedValue({}) },
}));
jest.mock('../../src/auth/user.model', () => ({
  UserModel: { findByIdAndUpdate: jest.fn().mockResolvedValue({}) },
}));

import axios from 'axios';
import sharp from 'sharp';
import { JobModel } from '../../src/jobs/job.model';
import { UserModel } from '../../src/auth/user.model';

const mockJobId = '507f1f77bcf86cd799439011';
const mockUserId = '507f1f77bcf86cd799439099';

const makeJob = (overrides = {}): Partial<Job> => ({
  attemptsMade: 0,
  data: {
    jobId: mockJobId,
    payload: { userId: mockUserId, imageUrl: 'http://example.com/img.jpg', width: 200, height: 200 },
  },
  ...overrides,
});

describe('processImageResize', () => {
  beforeEach(() => jest.clearAllMocks());

  it('marks job active, resizes image, updates user profileImageUrl, marks completed', async () => {
    const resizedBuffer = Buffer.from('resized-data');

    (axios.get as jest.Mock).mockResolvedValue({ data: Buffer.from('fake') });
    const sharpInstance = { resize: jest.fn().mockReturnThis(), toBuffer: jest.fn().mockResolvedValue({ data: resizedBuffer, info: { format: 'jpeg' } }) };
    (sharp as unknown as jest.Mock).mockReturnValue(sharpInstance);

    await processImageResize(makeJob() as Job);

    expect(JobModel.findByIdAndUpdate).toHaveBeenCalledWith(
      mockJobId, expect.objectContaining({ status: JobStatus.ACTIVE }),
    );
    expect(UserModel.findByIdAndUpdate).toHaveBeenCalledWith(
      mockUserId, expect.objectContaining({ profileImageUrl: expect.stringContaining('base64') }),
    );
    expect(JobModel.findByIdAndUpdate).toHaveBeenCalledWith(
      mockJobId, expect.objectContaining({ status: JobStatus.COMPLETED }),
    );
  });

  it('rethrows on error so BullMQ can retry', async () => {
    (axios.get as jest.Mock).mockRejectedValue(new Error('Network error'));

    await expect(processImageResize(makeJob() as Job)).rejects.toThrow('Network error');
  });
});
