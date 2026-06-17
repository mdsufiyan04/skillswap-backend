const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
require('dotenv').config();

// Ensure required env vars are present. In production, fail fast with a clear error.
const requiredEnv = ['JWT_SECRET', 'DATABASE_URL'];
requiredEnv.forEach((key) => {
  if (!process.env[key]) {
    if (process.env.NODE_ENV === 'production') {
      console.error(`Missing required environment variable: ${key}. Exiting.`);
      process.exit(1);
    } else {
      console.warn(`Warning: ${key} not set.`);
      if (key === 'JWT_SECRET') {
        process.env[key] = 'dev-fallback-secret';
      }
    }
  }
});

const authRoutes     = require('./routes/auth');
const userRoutes     = require('./routes/users');
const skillRoutes    = require('./routes/skills');
const requestRoutes  = require('./routes/requests');
const exchangeRoutes = require('./routes/exchanges');
const projectRoutes  = require('./routes/projects');

const app = express();

app.use((req, res, next) => {
  req.id = req.headers['x-request-id'] || crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);
  const started = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - started;
    if (res.statusCode >= 400 || ms > 10000) {
      console.warn('[REQUEST]', {
        requestId: req.id,
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        durationMs: ms
      });
    }
  });
  next();
});

const normalizeOrigin = (origin) => {
  if (!origin) return origin;
  try {
    const parsed = new URL(origin.trim());
    return parsed.origin;
  } catch {
    return origin.trim().replace(/\/+$/, '');
  }
};

const defaultAllowed = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5174',
  'http://localhost:5175',
  'http://127.0.0.1:5175'
];
const extraAllowed = process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',').map(normalizeOrigin) : [];
const allowedOrigins = [...new Set([...defaultAllowed.map(normalizeOrigin), ...extraAllowed])];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) {
      // Allow requests with no origin (like mobile apps or Postman)
      return callback(null, true);
    }
    if (allowedOrigins.includes(normalizeOrigin(origin))) {
      callback(null, true);
    } else {
      const error = new Error(`CORS origin denied: ${origin}`);
      error.statusCode = 403;
      callback(error);
    }
  },
  methods: ['GET','POST','PUT','DELETE'],
  allowedHeaders: ['Content-Type','Authorization'],
  credentials: true
}));
app.use(express.json({ limit: '1mb' }));

app.use('/api/auth',      authRoutes);
app.use('/api/users',     userRoutes);
app.use('/api/skills',    skillRoutes);
app.use('/api/requests',  requestRoutes);
app.use('/api/exchanges', exchangeRoutes);
app.use('/api/projects',  projectRoutes);

// Health check endpoint with database verification
app.get('/api/health', async (req, res) => {
  try {
    const prisma = require('./lib/prisma');
    
    // Test database connection
    await prisma.$queryRaw`SELECT 1`;
    
    res.json({ 
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: 'connected',
      env: {
        nodeEnv: process.env.NODE_ENV,
        hasJWTSecret: !!process.env.JWT_SECRET,
        hasDatabaseUrl: !!process.env.DATABASE_URL
      }
    });
  } catch (err) {
    console.error('[HEALTH] Health check failed:', {
      requestId: req.id,
      message: err.message,
      code: err.code,
      name: err.name
    });
    res.status(503).json({ 
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Database health check failed',
      requestId: req.id,
      database: 'disconnected'
    });
  }
});

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found', requestId: req.id });
});

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);

  const status = err.statusCode || err.status || 500;
  console.error('[ERROR]', {
    requestId: req.id,
    method: req.method,
    path: req.originalUrl,
    status,
    message: err.message,
    stack: process.env.NODE_ENV === 'production' ? undefined : err.stack
  });

  res.status(status).json({
    error: status === 403 ? 'This frontend origin is not allowed by the API.' : 'Server error. Please try again.',
    requestId: req.id
  });
});

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => console.log(`[SERVER] SkillSwap API running on port ${PORT}`));

server.on('error', (err) => {
  console.error('[SERVER] Failed to start', {
    message: err.message,
    code: err.code,
    port: PORT
  });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('[PROCESS] Unhandled promise rejection', reason);
});

module.exports = app;
