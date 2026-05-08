/**
 * Demo seed script — creates two users and sample job postings/applications.
 * Safe to re-run: wipes previous seed data first.
 *
 * Locally:  npm run seed
 * Docker:   runs automatically on `docker-compose up` before the API starts
 */

import mongoose from 'mongoose';
import * as bcrypt from 'bcrypt';
import { UserModel } from '../auth/user.model';
import { JobPostingModel } from '../job-postings/job-posting.model';
import { ApplicationModel } from '../applications/application.model';
import { UserRole, PostingType, PostingStatus, ApplicationStatus } from '../common/constants';

const ADMIN = { email: 'admin@eventually.com', password: 'Admin1234!' };
const USER  = { email: 'user@eventually.com',  password: 'User1234!' };

const MONGO_URI = process.env.MONGO_URI ?? 'mongodb://localhost:27017/eventually';

async function wipe() {
  const emails = [ADMIN.email, USER.email];
  const users  = await UserModel.find({ email: { $in: emails } });
  const ids    = users.map(u => u._id);
  await ApplicationModel.deleteMany({ userId: { $in: ids } });
  await JobPostingModel.deleteMany({ postedBy: { $in: ids } });
  await UserModel.deleteMany({ email: { $in: emails } });
  console.log('[seed] wiped previous seed data');
}

async function seed() {
  const adminUser = await UserModel.create({
    email: ADMIN.email,
    passwordHash: await bcrypt.hash(ADMIN.password, 10),
    role: UserRole.ADMIN,
  });

  const regularUser = await UserModel.create({
    email: USER.email,
    passwordHash: await bcrypt.hash(USER.password, 10),
    role: UserRole.USER,
  });

  const postings = await JobPostingModel.insertMany([
    {
      title: 'Senior Full-Stack Engineer',
      description: 'Own features end-to-end across our TypeScript/React stack. 5+ years required.',
      company: 'TechCorp',
      location: 'Remote',
      type: PostingType.FULL_TIME,
      status: PostingStatus.OPEN,
      requiredSkills: ['TypeScript', 'React', 'Node.js', 'PostgreSQL', 'Docker'],
      postedBy: adminUser._id,
    },
    {
      title: 'Data Analyst',
      description: 'Translate raw data into actionable insights. SQL and Python required.',
      company: 'AnalyticsCo',
      location: 'New York',
      type: PostingType.FULL_TIME,
      status: PostingStatus.OPEN,
      requiredSkills: ['SQL', 'Python', 'Excel', 'Tableau', 'Statistics'],
      postedBy: adminUser._id,
    },
    {
      title: 'DevOps Engineer',
      description: 'CI/CD pipelines, Kubernetes, and cloud infrastructure. 3-month contract.',
      company: 'CloudSystems',
      location: 'Remote',
      type: PostingType.CONTRACT,
      status: PostingStatus.OPEN,
      requiredSkills: ['Docker', 'Kubernetes', 'CI/CD', 'Terraform', 'AWS'],
      postedBy: adminUser._id,
    },
    {
      title: 'Junior Frontend Developer',
      description: 'React and Tailwind. Great team, flexible hours.',
      company: 'StartupXYZ',
      location: 'London',
      type: PostingType.PART_TIME,
      status: PostingStatus.CLOSED,
      requiredSkills: ['React', 'Tailwind', 'JavaScript', 'HTML', 'CSS'],
      postedBy: adminUser._id,
    },
  ]);

  const [seniorEng, , devOps] = postings;

  await ApplicationModel.create({
    jobPostingId: seniorEng._id,
    userId: regularUser._id,
    coverLetter: 'I have been building full-stack products for six years and love TypeScript. Excited to join TechCorp.',
    resumeUrl: 'https://example.com/resume-user.pdf',
    skills: ['TypeScript', 'React', 'Node.js', 'MongoDB'],
    status: ApplicationStatus.REVIEWED,
  });

  await ApplicationModel.create({
    jobPostingId: devOps._id,
    userId: regularUser._id,
    coverLetter: 'Strong background in Docker and Kubernetes. Available immediately for the contract.',
    resumeUrl: 'https://example.com/resume-user.pdf',
    skills: ['Docker', 'Kubernetes', 'Linux', 'AWS'],
    status: ApplicationStatus.PENDING,
  });

  console.log('[seed] created admin:', ADMIN.email, '/', ADMIN.password);
  console.log('[seed] created user: ', USER.email,  '/', USER.password);
  console.log('[seed] created', postings.length, 'postings, 2 applications');
}

mongoose.connect(MONGO_URI)
  .then(wipe)
  .then(seed)
  .catch(err => { console.error('[seed] failed:', err.message); process.exit(1); })
  .finally(() => mongoose.disconnect());
