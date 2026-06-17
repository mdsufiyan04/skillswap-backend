const express = require('express');
const prisma = require('../lib/prisma');
const auth = require('../middleware/authMiddleware');

const router = express.Router();

// GET /api/users/me — get current user profile
router.get('/me', auth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      include: {
        skills: true,
        reviewsReceived: { include: { author: true } }
      }
    });
    const { password, ...safeUser } = user;
    res.json(safeUser);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/users/:id — get any user public profile
router.get('/:id', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: parseInt(req.params.id) },
      include: {
        skills: true,
        reviewsReceived: { include: { author: true } }
      }
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const { password, ...safeUser } = user;
    res.json(safeUser);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/users/me — update profile
router.put('/me', auth, async (req, res) => {
  try {
    const { name, bio, location, college } = req.body;
    const updated = await prisma.user.update({
      where: { id: req.user.userId },
      data: { name, bio, location, college }
    });
    const { password, ...safeUser } = updated;
    res.json(safeUser);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/users — get all users for browse/matching
router.get('/', async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      include: { skills: true },
      orderBy: { rating: 'desc' }
    });
    const safe = users.map(({ password, ...u }) => u);
    res.json(safe);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
