import { Job } from 'bullmq';
import { processReportGenerate } from '../../src/workers/report-generate.worker';
import { JobStatus } from '../../src/common/constants';

jest.mock('fast-csv', () => ({ writeToString: jest.fn() }));
jest.mock('../../src/jobs/job.model', () => ({
  JobModel: { findByIdAndUpdate: jest.fn().mockResolvedValue({}) },
}));
jest.mock('../../src/job-postings/job-posting.model', () => ({
  JobPostingModel: {
    findById: jest.fn(),
  },
}));
jest.mock('../../src/applications/application.model', () => ({
  ApplicationModel: {
    find: jest.fn(),
  },
}));

import { writeToString } from 'fast-csv';
import { JobModel } from '../../src/jobs/job.model';
import { JobPostingModel } from '../../src/job-postings/job-posting.model';
import { ApplicationModel } from '../../src/applications/application.model';

const mockJobId = '507f1f77bcf86cd799439012';
const mockPostingId = '507f1f77bcf86cd799439013';

const makeJob = (): Partial<Job> => ({
  attemptsMade: 0,
  data: {
    jobId: mockJobId,
    payload: { jobPostingId: mockPostingId },
  },
});

describe('processReportGenerate', () => {
  beforeEach(() => jest.clearAllMocks());

  it('marks job active, generates skills match CSV, marks completed', async () => {
    (JobPostingModel.findById as jest.Mock).mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: mockPostingId,
        requiredSkills: ['TypeScript', 'React', 'Node.js'],
      }),
    });

    (ApplicationModel.find as jest.Mock).mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([
        {
          userId: { email: 'user@example.com' },
          skills: ['TypeScript', 'React'],
        },
      ]),
    });

    (writeToString as jest.Mock).mockResolvedValue('applicantEmail,appliedSkills,matchedSkills,missingSkills,matchScore\nuser@example.com,TypeScript React,TypeScript React,Node.js,67%\n');

    await processReportGenerate(makeJob() as Job);

    expect(JobModel.findByIdAndUpdate).toHaveBeenCalledWith(
      mockJobId, expect.objectContaining({ status: JobStatus.ACTIVE }),
    );
    expect(writeToString).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          applicantEmail: 'user@example.com',
          matchedSkills: 'TypeScript, React',
          missingSkills: 'Node.js',
          matchScore: '67%',
        }),
      ]),
      expect.anything(),
    );
    expect(JobModel.findByIdAndUpdate).toHaveBeenCalledWith(
      mockJobId,
      expect.objectContaining({ status: JobStatus.COMPLETED, result: expect.objectContaining({ rowCount: 1 }) }),
    );
  });

  it('uses N/A match score when posting has no required skills', async () => {
    (JobPostingModel.findById as jest.Mock).mockReturnValue({
      lean: jest.fn().mockResolvedValue({ _id: mockPostingId, requiredSkills: [] }),
    });

    (ApplicationModel.find as jest.Mock).mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([
        { userId: { email: 'user@example.com' }, skills: ['TypeScript'] },
      ]),
    });

    (writeToString as jest.Mock).mockResolvedValue('');

    await processReportGenerate(makeJob() as Job);

    expect(writeToString).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ matchScore: 'N/A' }),
      ]),
      expect.anything(),
    );
  });

  it('rethrows on error so BullMQ can retry', async () => {
    (JobPostingModel.findById as jest.Mock).mockReturnValue({
      lean: jest.fn().mockRejectedValue(new Error('DB error')),
    });

    await expect(processReportGenerate(makeJob() as Job)).rejects.toThrow('DB error');
  });
});
