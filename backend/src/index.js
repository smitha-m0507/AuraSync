import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import { connectDB } from './db/pool.js';
import { errorHandler } from './middleware/errorHandler.js';
import authRoutes from './routes/auth.js';
import jobsRoutes from './routes/jobs.js';
import reportsRoutes from './routes/reports.js';
import usersRoutes from './routes/users.js';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(helmet());

const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://localhost:3000'
].filter(Boolean);

const corsOptions = {
  origin: allowedOrigins,
  credentials: true
};
app.use(cors(corsOptions));

app.use(cookieParser());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  // Job status is polled every few seconds while audio is processed, so the ceiling must allow for it.
  max: Number(process.env.RATE_LIMIT_MAX) || 1000,
  standardHeaders: true,
  legacyHeaders: false
});
app.use(globalLimiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api/v1/auth', authLimiter);

app.get('/health', (req, res) => {
  res.json({ success: true, message: 'AuraSync API healthy' });
});

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/jobs', jobsRoutes);
app.use('/api/v1/reports', reportsRoutes);
app.use('/api/v1/users', usersRoutes);

app.use(errorHandler);

async function startServer() {
  try {
    await connectDB();
    
    app.listen(PORT, () => {
      console.log(`AuraSync API server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();