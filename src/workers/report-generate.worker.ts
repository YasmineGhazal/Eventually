import { Job } from 'bullmq';
import { writeToString } from 'fast-csv';
import { JobModel } from '../jobs/job.model';
import { JobPostingModel } from '../job-postings/job-posting.model';
import { ApplicationModel, IApplication } from '../applications/application.model';
import { JobStatus } from '../common/constants';
import { Types } from 'mongoose';

interface ReportPayload {
  jobPostingId: string;
}

type PopulatedApplication = Omit<IApplication, 'userId'> & {
  userId: { _id: Types.ObjectId; email: string };
};

export async function processReportGenerate(job: Job): Promise<void> {
  const { jobId, payload } = job.data as { jobId: string; payload: ReportPayload };

  await JobModel.findByIdAndUpdate(jobId, { status: JobStatus.ACTIVE, attempts: job.attemptsMade + 1 });

  const posting = await JobPostingModel.findById(payload.jobPostingId).lean();
  if (!posting) throw new Error(`Job posting ${payload.jobPostingId} not found`);

  const applications = await ApplicationModel.find({ jobPostingId: payload.jobPostingId })
    .populate('userId', 'email')
    .lean() as unknown as PopulatedApplication[];

  const required = posting.requiredSkills ?? [];

  const rows = applications.map(app => {
    const skills = app.skills ?? [];
    const matched = skills.filter(s => required.includes(s));
    const missing = required.filter(s => !skills.includes(s));
    const matchScore = required.length > 0
      ? `${Math.round((matched.length / required.length) * 100)}%`
      : 'N/A';

    return {
      applicantEmail: app.userId.email,
      appliedSkills: skills.join(', '),
      matchedSkills: matched.join(', '),
      missingSkills: missing.join(', '),
      matchScore,
    };
  });

  const csv = await writeToString(rows, { headers: true });

  await JobModel.findByIdAndUpdate(jobId, {
    status: JobStatus.COMPLETED,
    result: { jobPostingId: payload.jobPostingId, csv, rowCount: rows.length },
  });
}
