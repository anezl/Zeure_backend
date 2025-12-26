const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const bcrypt = require("bcrypt");

const { PrismaClient } = require("../generated/prisma");
const prisma = new PrismaClient();

const { sendResetEmail } = require("../utils/mailer");


//POST /password/forgot
router.post("/forgot", async (req, res) => {
  try {
    const email = req.body.email
      ? String(req.body.email).trim().toLowerCase()
      : "";

    if (!email) {
      return res.status(400).json({ error: "Email required" });
    }

    const user = await prisma.users.findUnique({
      where: { email },
      select: { user_id: true },
    });

    if (!user) {
      return res.json({
        message: "If the email exists, you will receive a reset link.",
      });
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 1000 * 60 * 30); // 30 min

    await prisma.users.update({
      where: { email },
      data: {
        reset_token: token,
        reset_token_expires: expires,
      },
    });

    const resetLink = `http://localhost:5173/reset-password?token=${token}`;

    await sendResetEmail(email, resetLink);

    res.json({
      message: "If the email exists, you will receive a reset link.",
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Server error" });
  }
});


//POST /password/reset

router.post("/reset", async (req, res) => {
  try {
    const token = String(req.body.token || "");
    const password = String(req.body.password || "");

    if (!token || !password) {
      return res.status(400).json({ error: "Token and password required" });
    }

    if (password.length < 6) {
      return res
        .status(400)
        .json({ error: "Password must be at least 6 characters" });
    }

    const user = await prisma.users.findFirst({
      where: {
        reset_token: token,
        reset_token_expires: { gt: new Date() },
      },
      select: { user_id: true },
    });

    if (!user) {
      return res.status(400).json({ error: "Invalid or expired token" });
    }

    const hashed = await bcrypt.hash(password, 10);

    await prisma.users.update({
      where: { user_id: user.user_id },
      data: {
        password: hashed,
        reset_token: null,
        reset_token_expires: null,
      },
    });

    res.json({ message: "Password updated" });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
