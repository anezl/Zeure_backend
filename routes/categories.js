const express = require("express");
const router = express.Router();

const { PrismaClient } = require("../generated/prisma");
const prisma = new PrismaClient();

router.get("/", async (req, res) => {
  try {
    const cats = await prisma.categories.findMany({
      select: { category_id: true, name: true },
      orderBy: { name: "asc" },
    });
    res.json(cats);
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
