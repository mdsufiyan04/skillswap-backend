const express = require('express');
const prisma = require('../lib/prisma');
const auth = require('../middleware/authMiddleware');

const router = express.Router();

// POST /api/requests — send request
router.post('/', auth, async (req, res) => {
  try {
    const { toUserId, skillId, message } = req.body;
    if (toUserId === req.user.userId)
      return res.status(400).json({ error: 'Cannot send request to yourself' });
    const request = await prisma.request.create({
      data: { fromUserId: req.user.userId, toUserId: parseInt(toUserId), skillId: parseInt(skillId), message },
      include: {
        fromUser: { select: { id: true, name: true, username: true, avatar: true, college: true, rating: true } },
        toUser:   { select: { id: true, name: true, username: true, avatar: true, college: true, rating: true } },
        skill: true
      }
    });
    res.status(201).json(request);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/requests — get my requests
router.get('/', auth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const incoming = await prisma.request.findMany({
      where: { toUserId: userId },
      include: { fromUser: { select: { id: true, name: true, username: true, avatar: true, college: true, rating: true, skills: true } }, skill: true }
    });
    const outgoing = await prisma.request.findMany({
      where: { fromUserId: userId },
      include: { toUser: { select: { id: true, name: true, username: true, avatar: true, college: true, rating: true, skills: true } }, skill: true }
    });
    res.json({ incoming, outgoing });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/requests/:id — accept or reject
router.put('/:id', auth, async (req, res) => {
  try {
    const { status } = req.body;
    const request = await prisma.request.findUnique({
      where: { id: parseInt(req.params.id) },
      include: { skill: true }
    });
    if (!request || request.toUserId !== req.user.userId)
      return res.status(403).json({ error: 'Not allowed' });

    const updated = await prisma.request.update({
      where: { id: parseInt(req.params.id) },
      data: { status }
    });

    let exchange = null;
    if (status === 'accepted') {
      const toUserSkill = await prisma.skill.findFirst({
        where: { userId: request.toUserId, type: 'offer' }
      });
      exchange = await prisma.exchange.create({
        data: {
          requestId: request.id,
          user1Id:   request.fromUserId,
          user2Id:   request.toUserId,
          user1Skill: request.skill.name,
          user2Skill: toUserSkill ? toUserSkill.name : 'Skill',
        }
      });
    }

    res.json({ ...updated, exchangeId: exchange?.id ?? null, exchange });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
