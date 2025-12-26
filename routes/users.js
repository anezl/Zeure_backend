const express = require("express");
const router = express.Router();

const { PrismaClient } = require("../generated/prisma");
const prisma = new PrismaClient();

const { requireAuth } = require("../middlewares/auth");

// =========================
// GET /users/me
// =========================
router.get("/me", requireAuth, async (req, res) => {
  try {
    const user = await prisma.users.findUnique({
      where: { user_id: req.user.user_id },
      select: {
        user_id: true,
        user_name: true,
        email: true,
        is_admin: true,
        created_at: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(user);
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Server error" });
  }
});

// =========================
// PUT /users/me
// =========================
router.put("/me", requireAuth, async (req, res) => {
  try {
    const { user_name, email } = req.body;

    const data = {};

    if (user_name !== undefined) {
      if (typeof user_name !== "string" || user_name.length < 2) {
        return res.status(400).json({ error: "Invalid username" });
      }
      data.user_name = user_name;
    }

    if (email !== undefined) {
      if (typeof email !== "string" || !email.includes("@")) {
        return res.status(400).json({ error: "Invalid email" });
      }
      data.email = email.toLowerCase();
    }

    const updated = await prisma.users.update({
      where: { user_id: req.user.user_id },
      data,
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
    res.status(500).json({ error: "Server error" });
  }
});

// =========================
// DELETE /users/me
// =========================
router.delete("/me", requireAuth, async (req, res) => {
  try {
    const user_id = req.user.user_id;

    await prisma.cart.deleteMany({ where: { user_id } });
    await prisma.orders.deleteMany({ where: { cart: { user_id } } });

    await prisma.users.delete({
      where: { user_id },
    });

    res.json({ message: "Account deleted" });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
