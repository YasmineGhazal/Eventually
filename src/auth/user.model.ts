import { Schema, model, Document } from 'mongoose';
import { UserRole } from '../common/constants';

export interface IUser extends Document {
  email: string;
  passwordHash: string;
  role: UserRole;
  tokenVersion: number;
  profileImageUrl?: string;
}

const UserSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, lowercase: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: Object.values(UserRole), default: UserRole.USER },
    tokenVersion: { type: Number, default: 0 },
    profileImageUrl: { type: String },
  },
  { timestamps: true },
);

export const UserModel = model<IUser>('User', UserSchema);
