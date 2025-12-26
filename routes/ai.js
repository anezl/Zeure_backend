const express = require("express");
const router = express.Router();

const { PrismaClient } = require("../generated/prisma");
const prisma = new PrismaClient();

const { requireAuth } = require("../middlewares/auth");

const OpenAI = require("openai");

// =========================
// OpenAI client
// =========================
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MODEL = process.env.OPENAI_MODEL || "gpt-5-mini";
const FRONTEND_PRODUCT_BASE = "http://localhost:5173/product/";

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function normalizeProducts(rows) {
  return rows.map((p) => ({
    product_id: p.product_id,
    name: p.name,
    description: p.description || "",
    material: p.material || "",
    price: Number(p.price),
    img_url: p.img_url || "",
    variants: p.variants.map((v) => ({
      size: v.size,
      stock: v.stock,
    })),
  }));
}

// =========================
// POST /ai/chat
// =========================
router.post("/chat", requireAuth, async (req, res) => {
  try {
    const user_id = req.user.user_id;
    const message = String(req.body.message || "").trim();

    if (!message) {
      return res.status(400).json({ error: "Message required" });
    }

    //Create chat session
    const session = await prisma.chat_sessions.create({
      data: {
        user_id,
        title: "AI Stylist",
      },
    });

    //Save user message
    await prisma.chat_messages.create({
      data: {
        session_id: session.session_id,
        sender: "user",
        content: message,
      },
    });

    //Load products from real catalog
    const rows = await prisma.products.findMany({
      take: 30,
      orderBy: { created_at: "desc" },
      select: {
        product_id: true,
        name: true,
        description: true,
        material: true,
        price: true,
        img_url: true,
        variants: {
          select: {
            size: true,
            stock: true,
          },
        },
      },
    });

    const catalog = normalizeProducts(rows);

    if (catalog.length === 0) {
      return res.json({
        reply: "Your catalog is currently empty.",
        products: [],
        questions: [],
      });
    }

    //System prompt
    const systemPrompt = `
You are Zeure AI Stylist, a professional fashion assistant.

Rules:
- Recommend ONLY products provided in the catalog.
- Do NOT repeat questions the user already answered.
- If enough information exists, recommend products immediately.
- Never invent prices, sizes, stock, or URLs.
- Output ONLY valid JSON.

JSON format:
{
  "reply": string,
  "recommended": [
    {
      "product_id": number,
      "reason": string
    }
  ],
  "questions": string[]
}
`;

    const userPrompt = `
User request:
${message}

Catalog:
${JSON.stringify(catalog)}
`;

    //Call OpenAI
    const completion = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const text = completion.choices[0].message.content;
    const parsed = safeJsonParse(text);

    const reply =
      parsed?.reply ||
      "I can help you find something — could you share your budget or preferred fit?";

    const recommended = Array.isArray(parsed?.recommended)
      ? parsed.recommended
      : [];

    const questions = Array.isArray(parsed?.questions)
      ? parsed.questions
      : [];

    //Map recommendations to real products
    const byId = new Map(catalog.map((p) => [p.product_id, p]));

    const products = recommended
      .map((r) => {
        const p = byId.get(Number(r.product_id));
        if (!p) return null;

        return {
          product_id: p.product_id,
          name: p.name,
          price: p.price,
          img_url: p.img_url,
          reason: r.reason,
          product_url: FRONTEND_PRODUCT_BASE + p.product_id,
        };
      })
      .filter(Boolean)
      .slice(0, 3);

    // Save AI reply
    await prisma.chat_messages.create({
      data: {
        session_id: session.session_id,
        sender: "ai",
        content: reply,
      },
    });

    res.json({
      session_id: session.session_id,
      reply,
      products,
      questions,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "AI error" });
  }
});

module.exports = router;
