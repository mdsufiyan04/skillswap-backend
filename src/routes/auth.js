const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const router = express.Router();
const prisma = new PrismaClient();

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, username, college, location } = req.body;
    if (!name || !email || !password || !username)
      return res.status(400).json({ error: 'Name, email, username and password are required' });

    const existingEmail = await prisma.user.findUnique({ where: { email } });
    if (existingEmail) return res.status(400).json({ error: 'Email already registered' });

    const existingUsername = await prisma.user.findUnique({ where: { username } });
    if (existingUsername) return res.status(400).json({ error: 'Username already taken' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const avatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`;

    const user = await prisma.user.create({
      data: { name, email, password: hashedPassword, username, college, location, avatar }
    });

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      token,
      user: { id: user.id, name: user.name, email: user.email, username: user.username, avatar: user.avatar }
    });
  } catch (err) {
    console.error('FULL ERROR:', err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(400).json({ error: 'User not found' });

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) return res.status(400).json({ error: 'Wrong password' });

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, username: user.username, avatar: user.avatar, bio: user.bio, location: user.location, college: user.college, rating: user.rating, reviewCount: user.reviewCount, completedExchanges: user.completedExchanges }
    });
  } catch (err) {
    console.error('FULL ERROR:', err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

module.exports = router;
