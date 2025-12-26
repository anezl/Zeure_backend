const express = require("express");
const router = express.Router();

const { PrismaClient } = require("../generated/prisma");
const prisma = new PrismaClient();

const { requireAuth } = require("../middlewares/auth");

async function getOrCreateActiveCart(user_id) {
  let cart = await prisma.cart.findFirst({
    where: { user_id, is_ordered: false },
  });

  if (!cart) {
    cart = await prisma.cart.create({
      data: { user_id, is_ordered: false },
    });
  }

  return cart;
}

function normSize(v) {
  if (!v) return null;
  const s = String(v).trim().toUpperCase();
  return s.length ? s : null;
}

async function getVariant(product_id, size) {
  return prisma.product_variants.findUnique({
    where: { product_id_size: { product_id, size } },
    select: { variant_id: true, stock: true, size: true, product_id: true },
  });
}

// =========================
// GET /cart
// =========================
router.get("/", requireAuth, async (req, res) => {
  try {
    const cart = await getOrCreateActiveCart(req.user.user_id);

    const items = await prisma.cart_items.findMany({
      where: { cart_id: cart.cart_id },
      select: {
        cart_items_id: true,
        product_id: true,
        size: true,
        quantity: true,
        price: true,
        products: {
          select: { name: true, img_url: true },
        },
      },
      orderBy: { cart_items_id: "desc" },
    });

    const itemsWithStock = [];
    for (const it of items) {
      const size = normSize(it.size);
      let variant_stock = null;

      if (size) {
        const v = await getVariant(it.product_id, size);
        variant_stock = v ? Number(v.stock) : null;
      }

      itemsWithStock.push({
        ...it,
        variant_stock,
      });
    }

    let total = 0;
    for (const it of itemsWithStock) {
      total += Number(it.price) * Number(it.quantity || 1);
    }

    res.json({
      cart_id: cart.cart_id,
      items: itemsWithStock,
      total,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// =========================
// POST /cart/add
// =========================
router.post("/add", requireAuth, async (req, res) => {
  try {
    const product_id = parseInt(req.body.product_id);
    const quantity = req.body.quantity ? parseInt(req.body.quantity) : 1;
    const size = normSize(req.body.size);

    if (isNaN(product_id) || isNaN(quantity) || quantity < 1) {
      return res.status(400).json({ error: "Invalid input" });
    }

    if (!size) {
      return res.status(400).json({ error: "Size is required" });
    }

    const product = await prisma.products.findUnique({
      where: { product_id },
      select: { product_id: true, price: true },
    });

    if (!product) return res.status(404).json({ error: "Product not found" });

    const variant = await getVariant(product_id, size);
    if (!variant)
      return res.status(400).json({ error: "Invalid size for this product" });

    if (Number(variant.stock) <= 0) {
      return res.status(400).json({ error: `Out of stock for size ${size}` });
    }

    const cart = await getOrCreateActiveCart(req.user.user_id);

    const existing = await prisma.cart_items.findFirst({
      where: { cart_id: cart.cart_id, product_id, size },
      select: { cart_items_id: true, quantity: true },
    });

    const existingQty = Number(existing?.quantity || 0);
    const newQty = existingQty + quantity;

    if (newQty > Number(variant.stock)) {
      return res.status(400).json({
        error: `Only ${variant.stock} in stock for size ${size}`,
        available: Number(variant.stock),
        requested: newQty,
      });
    }

    if (existing) {
      const updated = await prisma.cart_items.update({
        where: { cart_items_id: existing.cart_items_id },
        data: { quantity: newQty },
      });
      return res.json(updated);
    }

    const created = await prisma.cart_items.create({
      data: {
        cart_id: cart.cart_id,
        product_id,
        size,
        quantity,
        price: product.price,
      },
    });

    res.status(201).json(created);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// =========================
// POST /cart/update
// =========================
router.post("/update", requireAuth, async (req, res) => {
  try {
    const cart_items_id = parseInt(req.body.cart_items_id);
    const quantity = parseInt(req.body.quantity);

    if (isNaN(cart_items_id) || isNaN(quantity) || quantity < 1) {
      return res.status(400).json({ error: "Invalid input" });
    }

    const cart = await getOrCreateActiveCart(req.user.user_id);

    const existing = await prisma.cart_items.findFirst({
      where: { cart_items_id, cart_id: cart.cart_id },
      select: { cart_items_id: true, product_id: true, size: true },
    });

    if (!existing) return res.status(404).json({ error: "Item not found" });

    const size = normSize(existing.size);
    if (!size) return res.status(400).json({ error: "Item has no size" });

    const variant = await getVariant(existing.product_id, size);
    if (!variant)
      return res.status(400).json({ error: "Invalid size for this product" });

    if (Number(variant.stock) <= 0) {
      return res.status(400).json({ error: `Out of stock for size ${size}` });
    }

    if (quantity > Number(variant.stock)) {
      return res.status(400).json({
        error: `Only ${variant.stock} in stock for size ${size}`,
        available: Number(variant.stock),
        requested: quantity,
      });
    }

    const updated = await prisma.cart_items.update({
      where: { cart_items_id },
      data: { quantity },
    });

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// =========================
// POST /cart/remove
// =========================
router.post("/remove", requireAuth, async (req, res) => {
  try {
    const product_id = parseInt(req.body.product_id);
    const size = normSize(req.body.size);

    if (isNaN(product_id))
      return res.status(400).json({ error: "Invalid product_id" });
    if (!size) return res.status(400).json({ error: "Size is required" });

    const cart = await getOrCreateActiveCart(req.user.user_id);

    const existing = await prisma.cart_items.findFirst({
      where: { cart_id: cart.cart_id, product_id, size },
    });

    if (!existing) return res.status(404).json({ error: "Item not found" });

    const qty = existing.quantity || 1;

    if (qty > 1) {
      const updated = await prisma.cart_items.update({
        where: { cart_items_id: existing.cart_items_id },
        data: { quantity: qty - 1 },
      });
      return res.json(updated);
    }

    await prisma.cart_items.delete({
      where: { cart_items_id: existing.cart_items_id },
    });

    res.json({ message: "Removed" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// =========================
// DELETE /cart/:cart_items_id
// =========================
router.delete("/:cart_items_id", requireAuth, async (req, res) => {
  try {
    const cart_items_id = parseInt(req.params.cart_items_id);
    if (isNaN(cart_items_id)) return res.status(400).json({ error: "Invalid id" });

    const cart = await getOrCreateActiveCart(req.user.user_id);

    const existing = await prisma.cart_items.findFirst({
      where: { cart_items_id, cart_id: cart.cart_id },
    });

    if (!existing) return res.status(404).json({ error: "Item not found" });

    await prisma.cart_items.delete({ where: { cart_items_id } });
    res.json({ message: "Deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// =========================
// POST /cart/checkout
// =========================
router.post("/checkout", requireAuth, async (req, res) => {
  try {
    const user_id = req.user.user_id;

    const result = await prisma.$transaction(async (tx) => {
      const cart = await tx.cart.findFirst({
        where: { user_id, is_ordered: false },
        select: { cart_id: true },
      });

      if (!cart) throw new Error("No active cart");

      const items = await tx.cart_items.findMany({
        where: { cart_id: cart.cart_id },
        select: { product_id: true, quantity: true, price: true, size: true },
      });

      if (!items.length) throw new Error("Cart is empty");

      // Validate stock by size
      for (const it of items) {
        const qty = Number(it.quantity || 1);
        const size = normSize(it.size);

        if (!size) throw new Error("Item has no size");

        const variant = await tx.product_variants.findUnique({
          where: { product_id_size: { product_id: it.product_id, size } },
          select: { variant_id: true, stock: true },
        });

        if (!variant) throw new Error("Invalid size for this product");

        const currentStock = Number(variant.stock || 0);
        if (qty > currentStock) {
          throw new Error(`Only ${currentStock} in stock for size ${size}`);
        }

        const updated = await tx.product_variants.updateMany({
          where: { variant_id: variant.variant_id, stock: { gte: qty } },
          data: { stock: { decrement: qty } },
        });

        if (updated.count !== 1) {
          throw new Error(`Not enough stock for size ${size}`);
        }
      }

      // Total
      let total = 0;
      for (const it of items) {
        total += Number(it.price) * Number(it.quantity || 1);
      }

      //Create order
      const order = await tx.orders.create({
        data: {
          cart_id: cart.cart_id,
          total_price: total,
          status: "PENDING",
        },
        select: { order_id: true },
      });

      //Close cart
      await tx.cart.update({
        where: { cart_id: cart.cart_id },
        data: { is_ordered: true },
      });

      //Create a new cart
      await tx.cart.create({
        data: { user_id, is_ordered: false },
      });

      return { order_id: order.order_id, total };
    });

    res.status(201).json({ message: "Order created", ...result });
  } catch (err) {
    console.error(err);

    const msg = String(err?.message || "");

    if (msg === "No active cart") return res.status(400).json({ error: "No active cart" });
    if (msg === "Cart is empty") return res.status(400).json({ error: "Cart is empty" });
    if (msg === "Item has no size") return res.status(400).json({ error: "Item has no size" });
    if (msg === "Invalid size for this product")
      return res.status(400).json({ error: "Invalid size for this product" });

    if (msg.startsWith("Only ")) return res.status(400).json({ error: msg });
    if (msg.startsWith("Not enough stock")) return res.status(400).json({ error: msg });

    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
