const express = require("express");
const router = express.Router();

const { PrismaClient } = require("../../generated/prisma");
const prisma = new PrismaClient();

const { requireAuth, requireAdmin } = require("../../middlewares/auth");

// =========================
// GET /admin/users
// =========================
router.get("/", requireAuth, requireAdmin, async (req, res) => {
  try {
    const users = await prisma.users.findMany({
      orderBy: { created_at: "desc" },
      select: {
        user_id: true,
        user_name: true,
        email: true,
        is_admin: true,
        created_at: true,
      },
    });

    res.json(users);
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Server error" });
  }
});

// =========================
// PUT /admin/users/:id
// =========================
router.put("/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid user id" });
    }

    const { is_admin } = req.body;
    if (typeof is_admin !== "boolean") {
      return res.status(400).json({ error: "is_admin must be boolean" });
    }

    if (req.user.user_id === id) {
      return res.status(400).json({ error: "You cannot change your own admin role" });
    }

    const updated = await prisma.users.update({
      where: { user_id: id },
      data: { is_admin },
      select: {
        user_id: true,
        user_name: true,
        email: true,
        is_admin: true,
      },
    });

    res.json(updated);
  } catch (err) {
    console.log(err);
    res.status(404).json({ error: "User not found" });
  }
});

// =========================
// DELETE /admin/users/:id
// =========================
router.delete("/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid user id" });
    }

    if (req.user.user_id === id) {
      return res.status(400).json({ error: "You cannot delete your own account" });
    }

    await prisma.users.delete({
      where: { user_id: id },
    });

    res.json({ message: "User deleted" });
  } catch (err) {
    console.log(err);
    res.status(404).json({ error: "User not found" });
  }
});

module.exports = router;
