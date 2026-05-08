import { Job } from 'bullmq';
import axios from 'axios';
import sharp from 'sharp';
import { JobModel } from '../jobs/job.model';
import { UserModel } from '../auth/user.model';
import { JobStatus } from '../common/constants';

interface ImageResizePayload {
  userId: string;
  imageUrl: string;
  width: number;
  height: number;
}

export async function processImageResize(job: Job): Promise<void> {
  const { jobId, payload } = job.data as { jobId: string; payload: ImageResizePayload };

  await JobModel.findByIdAndUpdate(jobId, { status: JobStatus.ACTIVE, attempts: job.attemptsMade + 1 });

  const response = await axios.get(payload.imageUrl, { responseType: 'arraybuffer' });
  const buffer = Buffer.from(response.data);

  const { data: resized, info } = await sharp(buffer).resize(payload.width, payload.height).toBuffer({ resolveWithObject: true });
  const dataUri = `data:image/${info.format};base64,${resized.toString('base64')}`;

  await UserModel.findByIdAndUpdate(payload.userId, { profileImageUrl: dataUri });

  await JobModel.findByIdAndUpdate(jobId, {
    status: JobStatus.COMPLETED,
    result: { userId: payload.userId, width: payload.width, height: payload.height },
  });
}
