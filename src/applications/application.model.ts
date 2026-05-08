import { Schema, model, Document, Types } from 'mongoose';
import { ApplicationStatus } from '../common/constants';

export interface IApplication extends Document {
  jobPostingId: Types.ObjectId;
  userId: Types.ObjectId;
  coverLetter: string;
  resumeUrl?: string;
  skills: string[];
  status: ApplicationStatus;
  createdAt: Date;
  updatedAt: Date;
}

const ApplicationSchema = new Schema<IApplication>(
  {
    jobPostingId: { type: Schema.Types.ObjectId, ref: 'JobPosting', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    coverLetter: { type: String, required: true },
    resumeUrl: { type: String },
    skills: { type: [String], default: [] },
    status: { type: String, enum: Object.values(ApplicationStatus), default: ApplicationStatus.PENDING },
  },
  { timestamps: true },
);

ApplicationSchema.index({ jobPostingId: 1, userId: 1 }, { unique: true });

export const ApplicationModel = model<IApplication>('Application', ApplicationSchema);
