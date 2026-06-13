const express = require('express');
const { PrismaClient } = require('@prisma/client');
const auth = require('../middleware/authMiddleware');

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/exchanges — get my active exchanges
router.get('/', auth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const exchanges = await prisma.exchange.findMany({
      where: { OR: [{ user1Id: userId }, { user2Id: userId }] },
      include: { user1: true, user2: true, messages: true }
    });
    res.json(exchanges);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/exchanges/:id — single exchange detail
router.get('/:id', auth, async (req, res) => {
  try {
    const exchange = await prisma.exchange.findUnique({
      where: { id: parseInt(req.params.id) },
      include: { user1: true, user2: true, messages: { include: { } }, reviews: true }
    });
    if (!exchange) return res.status(404).json({ error: 'Not found' });
    res.json(exchange);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/exchanges/:id/progress — update progress
router.put('/:id/progress', auth, async (req, res) => {
  try {
    const { sessionsCompleted, totalSessions, nextSession } = req.body;
    const progress = Math.round((sessionsCompleted / totalSessions) * 100);
    const updated = await prisma.exchange.update({
      where: { id: parseInt(req.params.id) },
      data: { sessionsCompleted, totalSessions, progress, nextSession }
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/exchanges/:id/messages — send message
router.post('/:id/messages', auth, async (req, res) => {
  try {
    const { text } = req.body;
    const message = await prisma.message.create({
      data: { exchangeId: parseInt(req.params.id), senderId: req.user.userId, text }
    });
    res.status(201).json(message);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/exchanges/:id/messages — get messages
router.get('/:id/messages', auth, async (req, res) => {
  try {
    const messages = await prisma.message.findMany({
      where: { exchangeId: parseInt(req.params.id) },
      orderBy: { createdAt: 'asc' }
    });
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/exchanges/:id/reviews — leave a review
router.post('/:id/reviews', auth, async (req, res) => {
  try {
    const { targetId, rating, text, skill } = req.body;
    const review = await prisma.review.create({
      data: { exchangeId: parseInt(req.params.id), authorId: req.user.userId, targetId: parseInt(targetId), rating, text, skill }
    });
    // Update target user rating
    const allReviews = await prisma.review.findMany({ where: { targetId: parseInt(targetId) } });
    const avgRating = allReviews.reduce((sum, r) => sum + r.rating, 0) / allReviews.length;
    await prisma.user.update({
      where: { id: parseInt(targetId) },
      data: { rating: Math.round(avgRating * 10) / 10, reviewCount: allReviews.length }
    });
    res.status(201).json(review);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
