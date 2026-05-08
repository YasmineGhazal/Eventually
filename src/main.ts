import 'dotenv/config';
import mongoose from 'mongoose';
import { config } from './common/config';
import { createApp } from './app';
import { startWorkers } from './workers/start-workers';

async function bootstrap() {
  await mongoose.connect(config.mongoUri);

  const app = createApp();
  const workers = startWorkers();

  const server = app.listen(config.port, () => {
    console.log(`Eventually API listening on port ${config.port}`);
  });

  const shutdown = async () => {
    await Promise.all(workers.map((w) => w.close()));
    server.close();
    await mongoose.disconnect();
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

bootstrap().catch(console.error);
