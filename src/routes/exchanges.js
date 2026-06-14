const express = require('express');
const { PrismaClient } = require('@prisma/client');
const auth = require('../middleware/authMiddleware');

const router = express.Router();
const prisma = new PrismaClient();

const exchangeInclude = {
  user1: { select: { id: true, name: true, username: true, avatar: true, college: true, rating: true } },
  user2: { select: { id: true, name: true, username: true, avatar: true, college: true, rating: true } },
  sessions: { orderBy: { createdAt: 'desc' } },
  resources: {
    include: { addedBy: { select: { id: true, name: true, avatar: true } } },
    orderBy: { createdAt: 'desc' }
  },
  reviews: true,
};

// GET /api/exchanges — get my active exchanges
router.get('/', auth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const exchanges = await prisma.exchange.findMany({
      where: { OR: [{ user1Id: userId }, { user2Id: userId }] },
      include: exchangeInclude,
      orderBy: { createdAt: 'desc' }
    });
    res.json(exchanges);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/exchanges/:id — single exchange detail
router.get('/:id', auth, async (req, res) => {
  try {
    const exchange = await prisma.exchange.findUnique({
      where: { id: parseInt(req.params.id) },
      include: exchangeInclude
    });
    if (!exchange) return res.status(404).json({ error: 'Not found' });
    res.json(exchange);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/exchanges/:id/progress — update progress, complete session, end exchange, schedule
router.put('/:id/progress', auth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const exchange = await prisma.exchange.findUnique({ where: { id } });
    if (!exchange) return res.status(404).json({ error: 'Not found' });

    const { action, date, time, topic, meetLink, sessionsCompleted, totalSessions, nextSession, status } = req.body;

    if (action === 'scheduleSession') {
      const session = await prisma.session.create({
        data: {
          exchangeId: id,
          date: date || '',
          time: time || '',
          topic: topic || '',
          meetLink: meetLink || null,
          completed: false
        }
      });
      const nextSessionLabel = `${date} at ${time} — ${topic}`;
      const updated = await prisma.exchange.update({
        where: { id },
        data: { nextSession: nextSessionLabel },
        include: exchangeInclude
      });
      return res.json({ ...updated, scheduledSession: session });
    }

    if (action === 'completeSession') {
      const newCompleted = exchange.sessionsCompleted + 1;
      const progress = Math.min(100, Math.round((newCompleted / exchange.totalSessions) * 100));

      const pendingSession = await prisma.session.findFirst({
        where: { exchangeId: id, completed: false },
        orderBy: { createdAt: 'desc' }
      });
      if (pendingSession) {
        await prisma.session.update({
          where: { id: pendingSession.id },
          data: { completed: true }
        });
      } else {
        await prisma.session.create({
          data: {
            exchangeId: id,
            date: new Date().toLocaleDateString(),
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            topic: 'Session completed',
            completed: true
          }
        });
      }

      const updated = await prisma.exchange.update({
        where: { id },
        data: {
          sessionsCompleted: newCompleted,
          progress,
          nextSession: newCompleted >= exchange.totalSessions ? null : exchange.nextSession
        },
        include: exchangeInclude
      });
      return res.json(updated);
    }

    if (action === 'endExchange') {
      const updated = await prisma.exchange.update({
        where: { id },
        data: { status: 'complete', progress: 100 },
        include: exchangeInclude
      });
      await prisma.user.update({
        where: { id: exchange.user1Id },
        data: { completedExchanges: { increment: 1 } }
      });
      await prisma.user.update({
        where: { id: exchange.user2Id },
        data: { completedExchanges: { increment: 1 } }
      });
      return res.json(updated);
    }

    const progress = sessionsCompleted != null && totalSessions
      ? Math.round((sessionsCompleted / totalSessions) * 100)
      : undefined;

    const updated = await prisma.exchange.update({
      where: { id },
      data: {
        sessionsCompleted: sessionsCompleted ?? undefined,
        totalSessions: totalSessions ?? undefined,
        nextSession: nextSession ?? undefined,
        status: status ?? undefined,
        progress: progress ?? undefined
      },
      include: exchangeInclude
    });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/exchanges/:id/resources — add learning resource
router.post('/:id/resources', auth, async (req, res) => {
  try {
    const { title, url, type } = req.body;
    if (!title || !url || !type)
      return res.status(400).json({ error: 'Title, URL, and type are required' });

    const resource = await prisma.exchangeResource.create({
      data: {
        exchangeId: parseInt(req.params.id),
        title,
        url,
        type,
        addedById: req.user.userId
      },
      include: { addedBy: { select: { id: true, name: true, avatar: true } } }
    });
    res.status(201).json(resource);
  } catch (err) {
    console.error(err);
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
      data: {
        exchangeId: parseInt(req.params.id),
        authorId: req.user.userId,
        targetId: parseInt(targetId),
        rating: parseInt(rating),
        text,
        skill
      }
    });
    const allReviews = await prisma.review.findMany({ where: { targetId: parseInt(targetId) } });
    const avgRating = allReviews.reduce((sum, r) => sum + r.rating, 0) / allReviews.length;
    await prisma.user.update({
      where: { id: parseInt(targetId) },
      data: { rating: Math.round(avgRating * 10) / 10, reviewCount: allReviews.length }
    });
    res.status(201).json(review);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
