const express = require("express");
const router = express.Router();

const { PrismaClient } = require("../../generated/prisma");
const prisma = new PrismaClient();

const { requireAuth, requireAdmin } = require("../../middlewares/auth");

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

router.get("/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

    const user = await prisma.users.findUnique({
      where: { user_id: id },
      select: {
        user_id: true,
        user_name: true,
        email: true,
        is_admin: true,
        created_at: true,
      },
    });

    if (!user) return res.status(404).json({ error: "Not found" });

    res.json(user);
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Server error" });
  }
});

router.put("/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

    const { is_admin } = req.body;
    if (typeof is_admin !== "boolean") {
      return res.status(400).json({ error: "is_admin must be boolean" });
    }

    const updated = await prisma.users.update({
      where: { user_id: id },
      data: { is_admin },
      select: {
        user_id: true,
        user_name: true,
        email: true,
        is_admin: true,
        created_at: true,
      },
    });

    res.json(updated);
  } catch (err) {
    console.log(err);
    res.status(404).json({ error: "Not found" });
  }
});

router.delete("/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

    if (req.user?.user_id === id) {
      return res.status(400).json({ error: "You cannot delete your own account" });
    }

    const exists = await prisma.users.findUnique({
      where: { user_id: id },
      select: { user_id: true },
    });

    if (!exists) return res.status(404).json({ error: "Not found" });

    await prisma.$transaction(async (tx) => {
      const carts = await tx.cart.findMany({
        where: { user_id: id },
        select: { cart_id: true },
      });

      const cartIds = carts.map((c) => c.cart_id);

      if (cartIds.length) {
        await tx.orders.deleteMany({ where: { cart_id: { in: cartIds } } });
        await tx.cart_items.deleteMany({ where: { cart_id: { in: cartIds } } });
        await tx.cart.deleteMany({ where: { cart_id: { in: cartIds } } });
      }

      await tx.reviews.deleteMany({ where: { user_id: id } }).catch(() => {});

      const sessions = await tx.chat_sessions.findMany({
        where: { user_id: id },
        select: { session_id: true },
      });

      const sessionIds = sessions.map((s) => s.session_id);

      if (sessionIds.length) {
        await tx.chat_messages.deleteMany({
          where: { session_id: { in: sessionIds } },
        });
        await tx.chat_sessions.deleteMany({
          where: { session_id: { in: sessionIds } },
        });
      }

      await tx.users.delete({ where: { user_id: id } });
    });

    res.json({ message: "Deleted" });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
