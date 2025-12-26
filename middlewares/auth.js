const jwt = require("jsonwebtoken");

function requireAuth(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing token" });
  }

  try {
    const token = header.split(" ")[1];
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    req.user = {
      user_id: payload.user_id,
      is_admin: payload.is_admin === true,
    };

    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.is_admin !== true) {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}

module.exports = { requireAuth, requireAdmin };
