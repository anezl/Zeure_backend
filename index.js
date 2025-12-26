require("dotenv").config();

const express = require("express");
const cors = require("cors");
const app = express();

app.use(
  cors({
    origin: "http://localhost:5173",
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());

const authRouter = require("./routes/auth");
const usersRouter = require("./routes/users");
const productRouter = require("./routes/product");
const ordersRouter = require("./routes/orders");
const cartRouter = require("./routes/cart");
const aiRouter = require("./routes/ai");
const reviewsRouter = require("./routes/reviews");
const adminProducts = require("./routes/admin/products_admin");
const adminUsers = require("./routes/admin/users_admin");
const categoriesRouter = require("./routes/categories");
const passwordResetRoutes = require("./routes/password_reset");



app.use("/auth", authRouter);
app.use("/users", usersRouter);
app.use("/products", productRouter);
app.use("/orders", ordersRouter);
app.use("/cart", cartRouter);
app.use("/ai", aiRouter);
app.use("/reviews", reviewsRouter);
app.use("/admin/products", adminProducts);
app.use("/admin/users", adminUsers);
app.use("/categories", categoriesRouter);
app.use("/password", passwordResetRoutes);

app.listen(3000, () => {
  console.log("...SERVER IS RUNNING ...");
});
