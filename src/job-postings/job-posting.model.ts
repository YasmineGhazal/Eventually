import { Schema, model, Document, Types } from 'mongoose';
import { PostingStatus, PostingType } from '../common/constants';

export interface IJobPosting extends Document {
  title: string;
  description: string;
  company: string;
  location: string;
  type: PostingType;
  status: PostingStatus;
  requiredSkills: string[];
  postedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const JobPostingSchema = new Schema<IJobPosting>(
  {
    title: { type: String, required: true },
    description: { type: String, required: true },
    company: { type: String, required: true },
    location: { type: String, required: true },
    type: { type: String, required: true, enum: Object.values(PostingType) },
    status: { type: String, enum: Object.values(PostingStatus), default: PostingStatus.OPEN, index: true },
    requiredSkills: { type: [String], default: [] },
    postedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

export const JobPostingModel = model<IJobPosting>('JobPosting', JobPostingSchema);
