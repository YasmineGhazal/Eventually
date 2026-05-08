export enum JobType {
  IMAGE_RESIZE = 'image-resize',
  REPORT_GENERATE = 'report-generate',
}

export enum JobStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
}

export enum PostingStatus {
  OPEN = 'open',
  CLOSED = 'closed',
}

export enum PostingType {
  FULL_TIME = 'full-time',
  PART_TIME = 'part-time',
  CONTRACT = 'contract',
  REMOTE = 'remote',
}

export enum ApplicationStatus {
  PENDING = 'pending',
  REVIEWED = 'reviewed',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
}

export const JOBS_QUEUE = 'jobs';
