const express = require('express');
const { PrismaClient } = require('@prisma/client');
const auth = require('../middleware/authMiddleware');

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/projects/my/projects — get my projects (must be before /:id)
router.get('/my/projects', auth, async (req, res) => {
  try {
    const created = await prisma.project.findMany({
      where: { adminId: req.user.userId },
      include: { roles: true, members: true, _count: { select: { members: true, applications: true } } }
    });
    const joined = await prisma.projectMember.findMany({
      where: { userId: req.user.userId },
      include: { project: { include: { admin: { select: { id: true, name: true, avatar: true } }, roles: true, members: true } } }
    });
    const applied = await prisma.projectApplication.findMany({
      where: { userId: req.user.userId },
      include: { project: { include: { admin: { select: { id: true, name: true, avatar: true } } } }, role: true }
    });
    res.json({ created, joined: joined.map(j => j.project), applied });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/projects — get all projects with roles and members
router.get('/', async (req, res) => {
  try {
    const { search, category, stage } = req.query;
    const projects = await prisma.project.findMany({
      where: {
        title: search ? { contains: search, mode: 'insensitive' } : undefined,
        category: category || undefined,
        stage: stage || undefined,
      },
      include: {
        admin: { select: { id: true, name: true, avatar: true, username: true } },
        roles: true,
        members: { include: { user: { select: { id: true, name: true, avatar: true } } } },
        _count: { select: { members: true, applications: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(projects);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/projects/:id — single project full detail
router.get('/:id', async (req, res) => {
  try {
    const project = await prisma.project.findUnique({
      where: { id: parseInt(req.params.id) },
      include: {
        admin: { select: { id: true, name: true, avatar: true, username: true, college: true, rating: true } },
        roles: { include: { _count: { select: { applications: true } } } },
        members: {
          include: {
            user: { select: { id: true, name: true, avatar: true, username: true, college: true, skills: true } },
            role: true
          }
        },
        posts: { include: { author: { select: { id: true, name: true, avatar: true } } }, orderBy: { createdAt: 'desc' } },
        tasks: true,
        _count: { select: { members: true, applications: true } }
      }
    });
    if (!project) return res.status(404).json({ error: 'Project not found' });
    res.json(project);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/projects — create project
router.post('/', auth, async (req, res) => {
  try {
    const { title, tagline, description, category, stage, githubUrl, figmaUrl, demoUrl, websiteUrl, coverImage, roles } = req.body;
    if (!title || !tagline || !description || !category)
      return res.status(400).json({ error: 'Title, tagline, description and category are required' });
    const project = await prisma.project.create({
      data: {
        title, tagline, description, category, stage: stage || 'Idea',
        githubUrl, figmaUrl, demoUrl, websiteUrl, coverImage,
        adminId: req.user.userId,
        roles: {
          create: roles?.map(r => ({
            title: r.title,
            description: r.description,
            skillsNeeded: r.skillsNeeded,
          })) || []
        }
      },
      include: { roles: true, admin: true }
    });
    res.status(201).json(project);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/projects/:id — update project (admin only)
router.put('/:id', auth, async (req, res) => {
  try {
    const project = await prisma.project.findUnique({ where: { id: parseInt(req.params.id) } });
    if (!project || project.adminId !== req.user.userId)
      return res.status(403).json({ error: 'Not allowed' });
    const { title, tagline, description, category, stage, githubUrl, figmaUrl, demoUrl, websiteUrl, coverImage } = req.body;
    const updated = await prisma.project.update({
      where: { id: parseInt(req.params.id) },
      data: { title, tagline, description, category, stage, githubUrl, figmaUrl, demoUrl, websiteUrl, coverImage }
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/projects/:id — delete project (admin only)
router.delete('/:id', auth, async (req, res) => {
  try {
    const project = await prisma.project.findUnique({ where: { id: parseInt(req.params.id) } });
    if (!project || project.adminId !== req.user.userId)
      return res.status(403).json({ error: 'Not allowed' });
    await prisma.project.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ message: 'Project deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/projects/:id/apply — apply to join project
router.post('/:id/apply', auth, async (req, res) => {
  try {
    const { roleId, message, contributionLevel } = req.body;
    const project = await prisma.project.findUnique({ where: { id: parseInt(req.params.id) } });
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (project.adminId === req.user.userId)
      return res.status(400).json({ error: 'You are the admin of this project' });
    const existing = await prisma.projectApplication.findFirst({
      where: { projectId: parseInt(req.params.id), userId: req.user.userId }
    });
    if (existing) return res.status(400).json({ error: 'Already applied to this project' });
    const application = await prisma.projectApplication.create({
      data: {
        projectId: parseInt(req.params.id),
        userId: req.user.userId,
        roleId: parseInt(roleId),
        message,
        contributionLevel
      },
      include: { user: { select: { id: true, name: true, avatar: true, skills: true } }, role: true }
    });
    res.status(201).json(application);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/projects/:id/applications — get all applications (admin only)
router.get('/:id/applications', auth, async (req, res) => {
  try {
    const project = await prisma.project.findUnique({ where: { id: parseInt(req.params.id) } });
    if (!project || project.adminId !== req.user.userId)
      return res.status(403).json({ error: 'Not allowed' });
    const applications = await prisma.projectApplication.findMany({
      where: { projectId: parseInt(req.params.id) },
      include: {
        user: { select: { id: true, name: true, avatar: true, college: true, rating: true, skills: true } },
        role: true
      }
    });
    res.json(applications);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/projects/:id/applications/:appId — accept or reject application
router.put('/:id/applications/:appId', auth, async (req, res) => {
  try {
    const { status } = req.body;
    const project = await prisma.project.findUnique({ where: { id: parseInt(req.params.id) } });
    if (!project || project.adminId !== req.user.userId)
      return res.status(403).json({ error: 'Not allowed' });
    const application = await prisma.projectApplication.update({
      where: { id: parseInt(req.params.appId) },
      data: { status },
      include: { user: true, role: true }
    });
    if (status === 'accepted') {
      await prisma.projectMember.create({
        data: {
          projectId: parseInt(req.params.id),
          userId: application.userId,
          roleId: application.roleId,
          contributionLevel: application.contributionLevel
        }
      });
      await prisma.projectRole.update({
        where: { id: application.roleId },
        data: { filled: true }
      });
    }
    res.json(application);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/projects/:id/messages — get project group chat messages
router.get('/:id/messages', auth, async (req, res) => {
  try {
    const messages = await prisma.projectMessage.findMany({
      where: { projectId: parseInt(req.params.id) },
      include: { sender: { select: { id: true, name: true, avatar: true } } },
      orderBy: { createdAt: 'asc' }
    });
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/projects/:id/messages — send message in project group chat
router.post('/:id/messages', auth, async (req, res) => {
  try {
    const { text } = req.body;
    const isMember = await prisma.projectMember.findFirst({
      where: { projectId: parseInt(req.params.id), userId: req.user.userId }
    });
    const project = await prisma.project.findUnique({ where: { id: parseInt(req.params.id) } });
    if (!isMember && project.adminId !== req.user.userId)
      return res.status(403).json({ error: 'Not a team member' });
    const message = await prisma.projectMessage.create({
      data: { projectId: parseInt(req.params.id), senderId: req.user.userId, text },
      include: { sender: { select: { id: true, name: true, avatar: true } } }
    });
    res.status(201).json(message);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/projects/:id/posts — post an update on project wall
router.post('/:id/posts', auth, async (req, res) => {
  try {
    const { content } = req.body;
    const post = await prisma.projectPost.create({
      data: { projectId: parseInt(req.params.id), authorId: req.user.userId, content },
      include: { author: { select: { id: true, name: true, avatar: true } } }
    });
    res.status(201).json(post);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/projects/:id/tasks — get project tasks
router.get('/:id/tasks', auth, async (req, res) => {
  try {
    const tasks = await prisma.projectTask.findMany({
      where: { projectId: parseInt(req.params.id) },
      orderBy: { createdAt: 'asc' }
    });
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/projects/:id/tasks — create task
router.post('/:id/tasks', auth, async (req, res) => {
  try {
    const { title, assignedTo } = req.body;
    const task = await prisma.projectTask.create({
      data: { projectId: parseInt(req.params.id), title, assignedTo: assignedTo ? parseInt(assignedTo) : null }
    });
    res.status(201).json(task);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/projects/:id/tasks/:taskId — update task status
router.put('/:id/tasks/:taskId', auth, async (req, res) => {
  try {
    const { status } = req.body;
    const task = await prisma.projectTask.update({
      where: { id: parseInt(req.params.taskId) },
      data: { status }
    });
    res.json(task);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
