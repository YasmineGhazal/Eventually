export const config = {
  mongoUri: process.env.MONGO_URI ?? 'mongodb://localhost:27017/eventually',
  redisHost: process.env.REDIS_HOST ?? 'localhost',
  redisPort: parseInt(process.env.REDIS_PORT ?? '6379', 10),
  jwtSecret: process.env.JWT_SECRET ?? 'dev-secret-change-in-prod',
  workerConcurrency: parseInt(process.env.WORKER_CONCURRENCY ?? '3', 10),
  port: parseInt(process.env.PORT ?? '3001', 10),
  adminSecret: process.env.ADMIN_SECRET ?? 'change-me',
};
