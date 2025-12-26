const express = require("express");
const router = express.Router();

const { PrismaClient } = require("../generated/prisma");
const prisma = new PrismaClient();

const { requireAuth, requireAdmin } = require("../middlewares/auth");

function normSize(v) {
  if (!v) return null;
  const s = String(v).trim().toUpperCase();
  return s.length ? s : null;
}

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

      //total
      let total = 0;
      for (const it of items) {
        total += Number(it.price) * Number(it.quantity || 1);
      }

      //create order
      const order = await tx.orders.create({
        data: {
          cart_id: cart.cart_id,
          total_price: total,
          status: "PENDING",
        },
        select: {
          order_id: true,
          total_price: true,
          status: true,
          created_at: true,
          cart_id: true,
        },
      });

      await tx.cart.update({
        where: { cart_id: cart.cart_id },
        data: { is_ordered: true },
      });

      return order;
    });

    res.status(201).json(result);
  } catch (e) {
    console.log(e);

    const msg = String(e?.message || "");

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

router.get("/cart/active", requireAuth, async (req, res) => {
  try {
    const user_id = req.user.user_id;

    const cart = await prisma.cart.findFirst({
      where: { user_id, is_ordered: false },
      select: {
        cart_id: true,
        created_at: true,
        cart_items: {
          select: {
            cart_items_id: true,
            product_id: true,
            quantity: true,
            price: true,
            size: true,
            products: { select: { name: true, img_url: true } },
          },
        },
      },
    });

    if (!cart) return res.json(null);

    let total_price = 0;
    for (const it of cart.cart_items) {
      total_price += Number(it.price) * (it.quantity || 1);
    }

    res.json({ ...cart, total_price });
  } catch (e) {
    console.log(e);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /orders
router.get("/", requireAuth, async (req, res) => {
  try {
    const orders = await prisma.orders.findMany({
      where: { cart: { user_id: req.user.user_id } },
      orderBy: { created_at: "desc" },
      select: {
        order_id: true,
        total_price: true,
        status: true,
        created_at: true,
        cart_id: true,
      },
    });

    res.json(orders);
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

//GET /orders/user/:userId 
router.get("/user/:userId", requireAuth, requireAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    if (isNaN(userId)) return res.status(400).json({ error: "Invalid userId" });

    const orders = await prisma.orders.findMany({
      where: { cart: { user_id: userId } },
      orderBy: { created_at: "desc" },
      select: {
        order_id: true,
        total_price: true,
        status: true,
        created_at: true,
        cart_id: true,
        cart: {
          select: {
            user_id: true,
            cart_items: {
              select: {
                quantity: true,
                price: true,
                size: true,
                products: { select: { name: true, img_url: true } },
              },
            },
          },
        },
      },
    });

    res.json(orders);
  } catch (e) {
    console.log(e);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /orders/:id
router.get("/:id", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

    const order = await prisma.orders.findUnique({
      where: { order_id: id },
      select: {
        order_id: true,
        total_price: true,
        status: true,
        created_at: true,
        cart: {
          select: {
            user_id: true,
            cart_items: {
              select: {
                quantity: true,
                price: true,
                size: true,
                products: { select: { name: true, img_url: true } },
              },
            },
          },
        },
      },
    });

    if (!order) return res.status(404).json({ error: "Not found" });

    if (order.cart.user_id !== req.user.user_id && req.user.is_admin !== true) {
      return res.status(403).json({ error: "Forbidden" });
    }

    res.json(order);
  } catch (e) {
    console.log(e);
    res.status(500).json({ error: "Server error" });
  }
});

// PUT /orders/:id/status (admin)
router.put("/:id/status", requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { status } = req.body;

    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    if (!status || typeof status !== "string")
      return res.status(400).json({ error: "Invalid status" });

    const updated = await prisma.orders.update({
      where: { order_id: id },
      data: { status },
      select: { order_id: true, status: true },
    });

    res.json(updated);
  } catch (e) {
    console.log(e);
    res.status(404).json({ error: "Not found" });
  }
});

module.exports = router;
