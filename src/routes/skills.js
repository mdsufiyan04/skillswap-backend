const express = require('express');
const prisma = require('../lib/prisma');
const auth = require('../middleware/authMiddleware');

const router = express.Router();

// GET /api/skills — all skills with search and filter
router.get('/', async (req, res) => {
  try {
    const { search, type, category } = req.query;
    const skills = await prisma.skill.findMany({
      where: {
        name:     search   ? { contains: search,   mode: 'insensitive' } : undefined,
        type:     type     ? type                                         : undefined,
        category: category ? category                                     : undefined,
      },
      include: { user: { select: { id: true, name: true, username: true, avatar: true, college: true, rating: true } } }
    });
    res.json(skills);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/skills — add skill
router.post('/', auth, async (req, res) => {
  try {
    const { name, category, level, type, description } = req.body;
    if (!name || !category || !level || !type)
      return res.status(400).json({ error: 'Name, category, level and type are required' });
    const skill = await prisma.skill.create({
      data: { name, category, level, type, description, userId: req.user.userId }
    });
    res.status(201).json(skill);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

// DELETE /api/skills/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    const skill = await prisma.skill.findUnique({ where: { id: parseInt(req.params.id) } });
    if (!skill || skill.userId !== req.user.userId)
      return res.status(403).json({ error: 'Not allowed' });
    await prisma.skill.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ message: 'Skill deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
