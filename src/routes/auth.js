const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const prisma = require('../lib/prisma');

const router = express.Router();

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

const logAuthError = (scope, err, extra = {}) => {
  console.error(`[${scope}]`, {
    requestId: extra.requestId,
    message: err.message,
    code: err.code,
    name: err.name,
    meta: err.meta
  });
};

const sendDatabaseError = (res, err, scope, requestId) => {
  logAuthError(scope, err, { requestId });

  if (err.code === 'P2021') {
    return res.status(503).json({
      error: 'Database schema is not ready. Please try again shortly.',
      code: 'DATABASE_SCHEMA_MISSING',
      requestId
    });
  }

  return res.status(503).json({
    error: 'Database is temporarily unavailable. Please try again.',
    code: 'DATABASE_UNAVAILABLE',
    requestId
  });
};

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { name, password, username, college, location } = req.body;
    const email = normalizeEmail(req.body.email);
    
    // Validation
    if (!name || !email || !password || !username)
      return res.status(400).json({ error: 'Name, email, username and password are required' });
    
    if (password.length < 8)
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email))
      return res.status(400).json({ error: 'Invalid email format' });

    // Verify JWT_SECRET is set
    if (!process.env.JWT_SECRET) {
      console.error('[REGISTER] CRITICAL: JWT_SECRET is not set', { requestId: req.id });
      return res.status(500).json({ error: 'Server configuration error', requestId: req.id });
    }

    // Database operations with error context
    let existingEmail;
    try {
      existingEmail = await prisma.user.findUnique({ where: { email } });
    } catch (dbErr) {
      return sendDatabaseError(res, dbErr, 'REGISTER email lookup failed', req.id);
    }
    if (existingEmail) return res.status(400).json({ error: 'Email already registered' });

    let existingUsername;
    try {
      existingUsername = await prisma.user.findUnique({ where: { username } });
    } catch (dbErr) {
      return sendDatabaseError(res, dbErr, 'REGISTER username lookup failed', req.id);
    }
    if (existingUsername) return res.status(400).json({ error: 'Username already taken' });

    // Hash password
    let hashedPassword;
    try {
      hashedPassword = await bcrypt.hash(password, 10);
    } catch (bcryptErr) {
      logAuthError('REGISTER bcrypt failed', bcryptErr, { requestId: req.id });
      return res.status(500).json({ error: 'Registration error', requestId: req.id });
    }

    const avatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`;

    // Create user
    let user;
    try {
      user = await prisma.user.create({
        data: { name, email, password: hashedPassword, username, college, location, avatar }
      });
    } catch (dbErr) {
      return sendDatabaseError(res, dbErr, 'REGISTER create user failed', req.id);
    }

    // Generate token
    let token;
    try {
      token = jwt.sign(
        { userId: user.id, email: user.email },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );
    } catch (jwtErr) {
      logAuthError('REGISTER JWT failed', jwtErr, { requestId: req.id });
      return res.status(500).json({ error: 'Failed to generate token', requestId: req.id });
    }

    res.status(201).json({
      token,
      user: { id: user.id, name: user.name, email: user.email, username: user.username, avatar: user.avatar }
    });
  } catch (err) {
    console.error('[REGISTER] Unexpected error:', {
      message: err.message,
      stack: err.stack,
      requestId: req.id
    });
    res.status(500).json({ error: 'Unexpected error', requestId: req.id });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const { password } = req.body;
    
    if (!email || !password)
      return res.status(400).json({ error: 'Email and password are required' });
    
    // Verify JWT_SECRET is set
    if (!process.env.JWT_SECRET) {
      console.error('[LOGIN] CRITICAL: JWT_SECRET is not set', { requestId: req.id });
      return res.status(500).json({ error: 'Server configuration error. Please contact support.', requestId: req.id });
    }

    // Database lookup with error context
    let user;
    try {
      user = await prisma.user.findUnique({ where: { email } });
    } catch (dbErr) {
      return sendDatabaseError(res, dbErr, 'LOGIN user lookup failed', req.id);
    }

    if (!user) return res.status(401).json({ error: 'Invalid email or password' });

    // Password comparison with error context
    let isValid;
    try {
      isValid = await bcrypt.compare(password, user.password);
    } catch (bcryptErr) {
      logAuthError('LOGIN bcrypt failed', bcryptErr, { requestId: req.id });
      return res.status(500).json({ error: 'Authentication error. Please try again.', requestId: req.id });
    }

    if (!isValid) return res.status(401).json({ error: 'Invalid email or password' });

    // JWT generation with error context
    let token;
    try {
      token = jwt.sign(
        { userId: user.id, email: user.email },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );
    } catch (jwtErr) {
      logAuthError('LOGIN JWT failed', jwtErr, { requestId: req.id });
      return res.status(500).json({ error: 'Failed to generate token. Please try again.', requestId: req.id });
    }

    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, username: user.username, avatar: user.avatar, bio: user.bio, location: user.location, college: user.college, rating: user.rating, reviewCount: user.reviewCount, completedExchanges: user.completedExchanges }
    });
  } catch (err) {
    console.error('[LOGIN] Unexpected error:', {
      message: err.message,
      stack: err.stack,
      name: err.name,
      requestId: req.id
    });
    res.status(500).json({ error: 'Unexpected error. Please try again later.', requestId: req.id });
  }
});

module.exports = router;
