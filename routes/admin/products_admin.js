const express = require("express");
const router = express.Router();

const { PrismaClient } = require("../../generated/prisma");
const prisma = new PrismaClient();

const { requireAuth, requireAdmin } = require("../../middlewares/auth");


function sumVariantStock(variants) {
  let total = 0;
  for (const v of variants) total += Number(v.stock || 0);
  return total;
}


function normSize(s) {
  return String(s || "").trim().toUpperCase();
}

// GET /admin/products  (incluye variants)
router.get("/", requireAuth, requireAdmin, async (req, res) => {
  try {
    const products = await prisma.products.findMany({
      orderBy: { created_at: "desc" },
      include: {
        variants: true,
        categories: true,
      },
    });

    res.json(products);
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /admin/products
router.post("/", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name, description, price, img_url, category_id, gender, material, variants } = req.body;

    if (!name || typeof name !== "string") {
      return res.status(400).json({ error: "Name is required" });
    }

    const priceNum = parseFloat(price);
    if (isNaN(priceNum)) return res.status(400).json({ error: "Invalid price" });

    const categoryIdNum =
      category_id === null || category_id === "" || category_id === undefined
        ? null
        : parseInt(category_id);

    if (category_id !== null && category_id !== "" && category_id !== undefined && isNaN(categoryIdNum)) {
      return res.status(400).json({ error: "Invalid category_id" });
    }

    let variantsArr = [];
    if (variants !== undefined) {
      if (!Array.isArray(variants)) return res.status(400).json({ error: "variants must be an array" });

      for (const v of variants) {
        if (!v || typeof v.size !== "string") return res.status(400).json({ error: "Invalid variant size" });
        const st = parseInt(v.stock);
        if (isNaN(st) || st < 0) return res.status(400).json({ error: "Invalid variant stock" });

        const size = normSize(v.size);
        if (!size) return res.status(400).json({ error: "Invalid variant size" });

        variantsArr.push({ size, stock: st });
      }
    }

    const totalStock = sumVariantStock(variantsArr);

    const created = await prisma.products.create({
      data: {
        name,
        description: description || null,
        price: priceNum,
        img_url: img_url || null,
        category_id: categoryIdNum,
        gender: gender ? String(gender).toUpperCase() : "UNISEX",
        material: material || null,
        stock: totalStock,
        variants: variantsArr.length
          ? {
              create: variantsArr,
            }
          : undefined,
      },
      include: { variants: true, categories: true },
    });

    res.status(201).json(created);
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Server error" });
  }
});

// PUT /admin/products/:id
router.put("/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

    const { name, description, price, img_url, category_id, gender, material, variants } = req.body;

    const data = {};

    if (name !== undefined) data.name = name;
    if (description !== undefined) data.description = description || null;
    if (img_url !== undefined) data.img_url = img_url || null;
    if (material !== undefined) data.material = material || null;
    if (gender !== undefined) data.gender = gender ? String(gender).toUpperCase() : "UNISEX";

    if (price !== undefined) {
      const priceNum = parseFloat(price);
      if (isNaN(priceNum)) return res.status(400).json({ error: "Invalid price" });
      data.price = priceNum;
    }

    if (category_id !== undefined) {
      if (category_id === null || category_id === "") data.category_id = null;
      else {
        const categoryIdNum = parseInt(category_id);
        if (isNaN(categoryIdNum)) return res.status(400).json({ error: "Invalid category_id" });
        data.category_id = categoryIdNum;
      }
    }

    let variantsArr = null;
    if (variants !== undefined) {
      if (!Array.isArray(variants)) return res.status(400).json({ error: "variants must be an array" });

      variantsArr = [];
      for (const v of variants) {
        if (!v || typeof v.size !== "string") return res.status(400).json({ error: "Invalid variant size" });
        const st = parseInt(v.stock);
        if (isNaN(st) || st < 0) return res.status(400).json({ error: "Invalid variant stock" });

        const size = normSize(v.size);
        if (!size) return res.status(400).json({ error: "Invalid variant size" });

        variantsArr.push({ size, stock: st });
      }

      data.stock = sumVariantStock(variantsArr);
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.products.update({
        where: { product_id: id },
        data,
      });

      if (variantsArr !== null) {
        await tx.product_variants.deleteMany({ where: { product_id: id } });

        if (variantsArr.length) {
          await tx.product_variants.createMany({
            data: variantsArr.map((v) => ({
              product_id: id,
              size: v.size,
              stock: v.stock,
            })),
          });
        }
      }

      return tx.products.findUnique({
        where: { product_id: id },
        include: { variants: true, categories: true },
      });
    });

    res.json(updated);
  } catch (err) {
    console.log(err);
    res.status(404).json({ error: "Not found" });
  }
});

// DELETE /admin/products/:id
router.delete("/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

    await prisma.$transaction(async (tx) => {
      await tx.cart_items.deleteMany({ where: { product_id: id } });
      await tx.reviews.deleteMany({ where: { product_id: id } });
      await tx.product_recommendations.deleteMany({ where: { product_id: id } });
      await tx.product_variants.deleteMany({ where: { product_id: id } });

      await tx.products.delete({ where: { product_id: id } });
    });

    res.json({ message: "Deleted" });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
