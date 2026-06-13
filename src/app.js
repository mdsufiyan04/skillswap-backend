const express = require('express');
const cors = require('cors');
require('dotenv').config();

const authRoutes     = require('./routes/auth');
const userRoutes     = require('./routes/users');
const skillRoutes    = require('./routes/skills');
const requestRoutes  = require('./routes/requests');
const exchangeRoutes = require('./routes/exchanges');

const app = express();

app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:5174'],
  methods: ['GET','POST','PUT','DELETE'],
  allowedHeaders: ['Content-Type','Authorization']
}));
app.use(express.json());

app.use('/api/auth',      authRoutes);
app.use('/api/users',     userRoutes);
app.use('/api/skills',    skillRoutes);
app.use('/api/requests',  requestRoutes);
app.use('/api/exchanges', exchangeRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'SkillSwap API running' }));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
