const express = require("express");
const router = express.Router();

const { PrismaClient } = require("../generated/prisma");
const prisma = new PrismaClient();


router.get("/", async (req, res) => {
  try {
    let category_id = undefined;
    let gender = undefined;
    let q = undefined;

    // -------- category_id --------
    if (req.query.category_id) {
      category_id = parseInt(req.query.category_id);
      if (isNaN(category_id)) {
        return res.status(400).json({ error: "Invalid category_id" });
      }
    }

    // -------- gender --------
    if (req.query.gender) {
      gender = String(req.query.gender).toUpperCase();
      if (gender !== "WOMEN" && gender !== "MEN" && gender !== "UNISEX") {
        return res.status(400).json({ error: "Invalid gender" });
      }
    }

    // -------- search query --------
    if (req.query.q) {
      q = String(req.query.q).trim();
      if (q.length === 0) q = undefined;
    }

    const where = {};

    if (category_id) where.category_id = category_id;
    if (gender) where.gender = gender;

  
    if (q) {
      const tokens = q
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 6);

      where.AND = tokens.map((token) => ({
        OR: [
          { name: { contains: token } },
          { description: { contains: token } },
        ],
      }));
    }

    const products = await prisma.products.findMany({
      where,
      orderBy: { created_at: "desc" },
      select: {
        product_id: true,
        name: true,
        price: true,
        img_url: true,
        stock: true,
        category_id: true,
        gender: true,
      },
    });

    res.json(products);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

//get product id
router.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid id" });
    }

    const product = await prisma.products.findUnique({
      where: { product_id: id },
      select: {
        product_id: true,
        name: true,
        description: true,
        price: true,
        img_url: true,
        stock: true,
        category_id: true,
        gender: true,
        material: true,

        variants: {
          select: {
            size: true,
            stock: true,
          },
          orderBy: { size: "asc" },
        },
      },
    });

    if (!product) {
      return res.status(404).json({ error: "Not found" });
    }

    res.json(product);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
