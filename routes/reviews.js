const express = require("express");
const router = express.Router();

const { PrismaClient } = require("../generated/prisma");
const prisma = new PrismaClient();

const { requireAuth } = require("../middlewares/auth");

// GET /reviews/:productId
router.get("/:productId", async (req, res) => {
  try {
    const productId = parseInt(req.params.productId);
    if (isNaN(productId)) return res.status(400).json({ error: "Invalid productId" });

    const reviews = await prisma.reviews.findMany({
      where: { product_id: productId },
      orderBy: { created_at: "desc" },
      select: {
        review_id: true,
        rating: true,
        comment: true,
        created_at: true,
        users: { select: { user_id: true, user_name: true } },
      },
    });

    res.json(reviews);
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

// POST /reviews/:productId 
router.post("/:productId", requireAuth, async (req, res) => {
  try {
    const productId = parseInt(req.params.productId);
    if (isNaN(productId)) return res.status(400).json({ error: "Invalid productId" });

    const rating = parseInt(req.body.rating);
    const comment = req.body.comment;

    if (isNaN(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ error: "Rating must be 1-5" });
    }

    if (comment !== undefined && comment !== null && typeof comment !== "string") {
      return res.status(400).json({ error: "Invalid comment" });
    }

    // check product exists
    const product = await prisma.products.findUnique({
      where: { product_id: productId },
      select: { product_id: true },
    });

    if (!product) return res.status(404).json({ error: "Product not found" });

    const created = await prisma.reviews.create({
      data: {
        rating,
        comment: comment ? comment : null,
        product_id: productId,
        user_id: req.user.user_id,
      },
      select: {
        review_id: true,
        rating: true,
        comment: true,
        created_at: true,
      },
    });

    res.status(201).json(created);
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

// DELETE /reviews/:id
router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

    const review = await prisma.reviews.findUnique({
      where: { review_id: id },
      select: { review_id: true, user_id: true },
    });

    if (!review) return res.status(404).json({ error: "Not found" });

    if (review.user_id !== req.user.user_id && req.user.is_admin !== true) {
      return res.status(403).json({ error: "Forbidden" });
    }

    await prisma.reviews.delete({ where: { review_id: id } });

    res.json({ message: "Deleted" });
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
