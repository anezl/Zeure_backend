const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const router = express.Router();

const { PrismaClient } = require("../generated/prisma");
const prisma = new PrismaClient();

const { sendVerifyEmail } = require("../utils/mailer");

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

function isEmail(s) {
  return typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

// =========================
// POST /auth/register
// =========================
router.post("/register", async (req, res) => {
  try {
    const { user_name, email, password } = req.body;

    if (!user_name || user_name.length < 2) {
      return res.status(400).json({ error: "Invalid user_name" });
    }

    if (!isEmail(email)) {
      return res.status(400).json({ error: "Invalid email" });
    }

    if (!password || password.length < 8) {
      return res.status(400).json({ error: "Password too short" });
    }

    const emailLower = String(email).toLowerCase();

    const exists = await prisma.users.findUnique({
      where: { email: emailLower },
    });
    if (exists) return res.status(409).json({ error: "Email already used" });

    const hashed = await bcrypt.hash(password, 10);

    // Create email verification token
    const verifyToken = crypto.randomBytes(32).toString("hex");
    const verifyExpires = new Date(Date.now() + 1000 * 60 * 60); // 60 minutes

    const created = await prisma.users.create({
      data: {
        user_name,
        email: emailLower,
        password: hashed,
        is_admin: false,
        email_verified: false,
        verify_token: verifyToken,
        verify_token_expires: verifyExpires,
      },
      select: { user_id: true, email: true },
    });

    // Send verification email
    const verifyLink = `${FRONTEND_URL}/verify-email?token=${verifyToken}`;

    try {
      await sendVerifyEmail(created.email, verifyLink);
    } catch (e) {
      console.log("sendVerifyEmail failed:", e);
    }

    const payload = {
      message: "User created. Please verify your email.",
    };

    if (process.env.NODE_ENV !== "production") {
      payload.verifyLink = verifyLink;
    }

    res.status(201).json(payload);
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Server error" });
  }
});

// =========================
// GET /auth/verify-email
// =========================
router.get("/verify-email", async (req, res) => {
  try {
    const token = req.query.token ? String(req.query.token).trim() : "";
    if (!token) return res.status(400).json({ error: "Missing token" });

    const user = await prisma.users.findFirst({
      where: {
        verify_token: token,
        verify_token_expires: { gt: new Date() },
      },
      select: { user_id: true },
    });

    if (!user) {
      return res.status(400).json({ error: "Invalid or expired token" });
    }

    await prisma.users.update({
      where: { user_id: user.user_id },
      data: {
        email_verified: true,
        verify_token: null,
        verify_token_expires: null,
      },
    });

    res.json({ message: "Email verified. You can login now." });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Server error" });
  }
});

// =========================
// POST /auth/login
// =========================
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password required" });
    }

    const user = await prisma.users.findUnique({
      where: { email: String(email).toLowerCase() },
    });

    // Same message to avoid leaking account existence
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Block login if email is not verified
    if (!user.email_verified) {
      return res.status(403).json({
        error: "Please verify your email before logging in.",
        code: "EMAIL_NOT_VERIFIED",
      });
    }

    const token = jwt.sign(
      { user_id: user.user_id, is_admin: user.is_admin },
      process.env.JWT_SECRET,
      { expiresIn: "2h" }
    );

    res.json({
      token,
      user: {
        user_id: user.user_id,
        user_name: user.user_name,
        email: user.email,
        is_admin: user.is_admin,
      },
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
