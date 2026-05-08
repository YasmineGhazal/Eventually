import mongoose from 'mongoose';
import request from 'supertest';
import { Queue } from 'bullmq';
import { createApp } from '../src/app';
import { config } from '../src/common/config';
import { JobModel } from '../src/jobs/job.model';
import { JobStatus, JobType } from '../src/common/constants';

const fakeQueue = {
  add: jest.fn().mockImplementation(async (name: string, data: { jobId: string }) => {
    setTimeout(async () => {
      const result = name === JobType.REPORT_GENERATE
        ? { jobPostingId: 'test', csv: 'applicantEmail,appliedSkills,matchedSkills,missingSkills,matchScore\n', rowCount: 0 }
        : { simulated: true };
      await JobModel.findByIdAndUpdate(data.jobId, { status: JobStatus.COMPLETED, result });
    }, 150);
    return {};
  }),
} as unknown as Queue;

async function pollJob(
  app: ReturnType<typeof createApp>,
  jobId: string,
  token: string,
  timeout = 5_000,
): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const res = await request(app).get(`/jobs/${jobId}`).set('Authorization', `Bearer ${token}`);
    if (res.body.status === JobStatus.COMPLETED || res.body.status === JobStatus.FAILED) {
      return res.body.status;
    }
    await new Promise(r => setTimeout(r, 100));
  }
  return 'timeout';
}

describe('Eventually API (e2e)', () => {
  let app: ReturnType<typeof createApp>;
  let adminToken: string;
  let userToken: string;
  let postingId: string;
  let applicationId: string;
  let skillsReportJobId: string;
  let profileImageJobId: string;

  const ts = Date.now();
  const admin = { email: `admin-${ts}@example.com`, password: 'password123', adminSecret: config.adminSecret };
  const user  = { email: `user-${ts}@example.com`,  password: 'password123' };

  beforeAll(async () => {
    await mongoose.connect(config.mongoUri);
    app = createApp(fakeQueue);
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  // ─── Auth ──────────────────────────────────────────────────────────────────

  describe('Auth', () => {
    it('POST /auth/register-admin → 201', async () => {
      const res = await request(app).post('/auth/register-admin').send(admin).expect(201);
      expect(res.body.access_token).toBeDefined();
      adminToken = res.body.access_token;
    });

    it('POST /auth/register → 201 (regular user)', async () => {
      const res = await request(app).post('/auth/register').send(user).expect(201);
      expect(res.body.access_token).toBeDefined();
      userToken = res.body.access_token;
    });

    it('POST /auth/register-admin with wrong secret → 403', async () => {
      await request(app)
        .post('/auth/register-admin')
        .send({ ...admin, email: 'other@example.com', adminSecret: 'wrong' })
        .expect(403);
    });

    it('POST /auth/login → 200 and refreshes token', async () => {
      const res = await request(app)
        .post('/auth/login')
        .send({ email: user.email, password: user.password })
        .expect(200);
      expect(res.body.access_token).toBeDefined();
      userToken = res.body.access_token;
    });

    it('GET /auth/me → returns profile without sensitive fields', async () => {
      const res = await request(app)
        .get('/auth/me')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);
      expect(res.body.email).toBe(user.email);
      expect(res.body.role).toBe('user');
      expect(res.body.passwordHash).toBeUndefined();
      expect(res.body.tokenVersion).toBeUndefined();
    });

    it('GET /auth/me without token → 401', async () => {
      await request(app).get('/auth/me').expect(401);
    });

    it('POST /auth/profile-image → 202 with jobId', async () => {
      const res = await request(app)
        .post('/auth/profile-image')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ imageUrl: 'https://example.com/photo.jpg' })
        .expect(202);
      expect(res.body.jobId).toBeDefined();
      profileImageJobId = res.body.jobId;
    });

    it('POST /auth/profile-image with invalid URL → 400', async () => {
      await request(app)
        .post('/auth/profile-image')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ imageUrl: 'not-a-url' })
        .expect(400);
    });
  });

  // ─── Job Postings ──────────────────────────────────────────────────────────

  describe('Job Postings', () => {
    it('POST /job-postings as user → 403', async () => {
      await request(app)
        .post('/job-postings')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ title: 'Dev', description: 'x', company: 'Acme', location: 'Remote', type: 'remote' })
        .expect(403);
    });

    it('POST /job-postings as admin → 201 with requiredSkills', async () => {
      const res = await request(app)
        .post('/job-postings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Senior Engineer', description: 'Build things', company: 'Acme',
          location: 'Remote', type: 'remote', requiredSkills: ['TypeScript', 'Node.js'],
        })
        .expect(201);
      expect(res.body._id).toBeDefined();
      expect(res.body.requiredSkills).toEqual(['TypeScript', 'Node.js']);
      postingId = res.body._id;
    });

    it('POST /job-postings with empty skill string → 400', async () => {
      await request(app)
        .post('/job-postings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Dev', description: 'x', company: 'Acme', location: 'Remote',
          type: 'remote', requiredSkills: [''],
        })
        .expect(400);
    });

    it('GET /job-postings → 200 for any authenticated user', async () => {
      const res = await request(app)
        .get('/job-postings')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);
      expect(res.body.data).toBeInstanceOf(Array);
    });

    it('GET /job-postings/:id → 200', async () => {
      const res = await request(app)
        .get(`/job-postings/${postingId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);
      expect(res.body.title).toBe('Senior Engineer');
    });

    it('PATCH /job-postings/:id as user → 403', async () => {
      await request(app)
        .patch(`/job-postings/${postingId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ status: 'closed' })
        .expect(403);
    });

    it('PATCH /job-postings/:id as admin → 200', async () => {
      const res = await request(app)
        .patch(`/job-postings/${postingId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ location: 'New York', requiredSkills: ['TypeScript', 'Node.js', 'Docker'] })
        .expect(200);
      expect(res.body.location).toBe('New York');
      expect(res.body.requiredSkills).toContain('Docker');
    });
  });

  // ─── Applications ──────────────────────────────────────────────────────────

  describe('Applications', () => {
    it('POST /job-postings/:id/apply as admin → 403', async () => {
      await request(app)
        .post(`/job-postings/${postingId}/apply`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ coverLetter: 'I am great', skills: ['TypeScript'] })
        .expect(403);
    });

    it('POST /job-postings/:id/apply as user → 201 with skills', async () => {
      const res = await request(app)
        .post(`/job-postings/${postingId}/apply`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ coverLetter: 'I am great', skills: ['TypeScript', 'Node.js'] })
        .expect(201);
      expect(res.body._id).toBeDefined();
      expect(res.body.skills).toEqual(['TypeScript', 'Node.js']);
      applicationId = res.body._id;
    });

    it('POST /job-postings/:id/apply with empty skill string → 400', async () => {
      await request(app)
        .post(`/job-postings/${postingId}/apply`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ coverLetter: 'Hello', skills: [''] })
        .expect(400);
    });

    it('POST /job-postings/:id/apply twice → 409', async () => {
      await request(app)
        .post(`/job-postings/${postingId}/apply`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ coverLetter: 'Again', skills: ['TypeScript'] })
        .expect(409);
    });

    it('GET /applications/mine → paginated list', async () => {
      const res = await request(app)
        .get('/applications/mine')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);
      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.total).toBeGreaterThan(0);
      expect(res.body.index).toBe(1);
      expect(res.body.size).toBe(20);
    });

    it('GET /job-postings/:id/applications as admin → paginated list', async () => {
      const res = await request(app)
        .get(`/job-postings/${postingId}/applications`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.data.length).toBe(1);
      expect(res.body.total).toBe(1);
      expect(res.body.index).toBe(1);
      expect(res.body.size).toBe(20);
    });

    it('GET /job-postings/:id/applications as user → 403', async () => {
      await request(app)
        .get(`/job-postings/${postingId}/applications`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
    });

    it('PATCH /applications/:id/status as admin → 200', async () => {
      const res = await request(app)
        .patch(`/applications/${applicationId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'reviewed' })
        .expect(200);
      expect(res.body.status).toBe('reviewed');
    });
  });

  // ─── Skills Report ─────────────────────────────────────────────────────────

  describe('Skills Report', () => {
    it('POST /job-postings/:id/skills-report as user → 403', async () => {
      await request(app)
        .post(`/job-postings/${postingId}/skills-report`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
    });

    it('POST /job-postings/:id/skills-report as admin → 202', async () => {
      const res = await request(app)
        .post(`/job-postings/${postingId}/skills-report`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(202);
      expect(res.body.jobId).toBeDefined();
      skillsReportJobId = res.body.jobId;
    });

    it('GET /jobs/:id/download as user → 403', async () => {
      await request(app)
        .get(`/jobs/${skillsReportJobId}/download`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
    });

    it('GET /jobs/:id/download as admin → CSV file after completion', async () => {
      await pollJob(app, skillsReportJobId, adminToken);

      const res = await request(app)
        .get(`/jobs/${skillsReportJobId}/download`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toContain('attachment');
      expect(res.text).toContain('applicantEmail');
    });
  });

  // ─── Background jobs ───────────────────────────────────────────────────────

  describe('Background Jobs', () => {
    it('GET /jobs without token → 401', async () => {
      await request(app).get('/jobs').expect(401);
    });

    it('POST /jobs as user → 403', async () => {
      await request(app)
        .post('/jobs')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ type: 'image-resize', payload: { imageUrl: 'https://example.com/img.jpg', width: 50, height: 50 } })
        .expect(403);
    });

    it('POST /jobs as admin with missing payload → 400', async () => {
      await request(app)
        .post('/jobs')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ type: 'image-resize' })
        .expect(400);
    });

    it('POST /jobs as admin → 201 and polls to completed', async () => {
      const post = await request(app)
        .post('/jobs')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ type: 'image-resize', payload: { imageUrl: 'https://example.com/img.jpg', width: 50, height: 50 } })
        .expect(201);

      const finalStatus = await pollJob(app, post.body.id, adminToken);
      expect(['completed', 'failed']).toContain(finalStatus);
    });

    it('GET /jobs/:id as user for own job → 200', async () => {
      await request(app)
        .get(`/jobs/${profileImageJobId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);
    });

    it('GET /jobs/:id as user for admin job → 403', async () => {
      await request(app)
        .get(`/jobs/${skillsReportJobId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
    });

    it('GET /jobs as user → only own jobs visible', async () => {
      const res = await request(app)
        .get('/jobs')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);
      const ids: string[] = res.body.data.map((j: any) => j._id);
      expect(ids).toContain(profileImageJobId);
      expect(ids).not.toContain(skillsReportJobId);
    });
  });
});
