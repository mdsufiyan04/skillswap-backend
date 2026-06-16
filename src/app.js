const express = require('express');
const cors = require('cors');
require('dotenv').config();

const authRoutes     = require('./routes/auth');
const userRoutes     = require('./routes/users');
const skillRoutes    = require('./routes/skills');
const requestRoutes  = require('./routes/requests');
const exchangeRoutes = require('./routes/exchanges');
const projectRoutes  = require('./routes/projects');

const app = express();

const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5174',
  'http://localhost:5175',
  'http://127.0.0.1:5175'
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS origin denied: ${origin}`));
    }
  },
  methods: ['GET','POST','PUT','DELETE'],
  allowedHeaders: ['Content-Type','Authorization']
}));
app.use(express.json());

app.use('/api/auth',      authRoutes);
app.use('/api/users',     userRoutes);
app.use('/api/skills',    skillRoutes);
app.use('/api/requests',  requestRoutes);
app.use('/api/exchanges', exchangeRoutes);
app.use('/api/projects',  projectRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'SkillSwap API running' }));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
