import { Schema, model, Document, Types } from 'mongoose';
import { JobStatus, JobType } from '../common/constants';

export interface IJob extends Document {
  type: JobType;
  status: JobStatus;
  payload: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: string;
  attempts: number;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const JobSchema = new Schema<IJob>(
  {
    type: { type: String, required: true, enum: Object.values(JobType) },
    status: { type: String, required: true, enum: Object.values(JobStatus), default: JobStatus.PENDING, index: true },
    payload: { type: Schema.Types.Mixed, required: true },
    result: { type: Schema.Types.Mixed },
    error: { type: String },
    attempts: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  },
  { timestamps: true },
);

JobSchema.index({ type: 1 });

export const JobModel = model<IJob>('Job', JobSchema);
