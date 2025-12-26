const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
});

// ===============================
// Password reset
// ===============================
async function sendResetEmail(to, resetLink) {
  await transporter.sendMail({
    from: `"ZEURE" <${process.env.MAIL_USER}>`,
    to,
    subject: "Reset your ZEURE password",
    html: `
      <h2>Password reset</h2>
      <p>You requested to reset your password.</p>
      <p>
        <a href="${resetLink}">
          Click here to reset your password
        </a>
      </p>
      <p>This link expires in 30 minutes.</p>
    `,
  });
}

// ===============================
// Email verification
// ===============================
async function sendVerifyEmail(to, verifyLink) {
  await transporter.sendMail({
    from: `"ZEURE" <${process.env.MAIL_USER}>`,
    to,
    subject: "Verify your ZEURE email",
    html: `
      <h2>Verify your email</h2>
      <p>Click the link to verify your account:</p>
      <p><a href="${verifyLink}">Verify email</a></p>
      <p>This link expires in 60 minutes.</p>
    `,
  });
}

module.exports = { sendResetEmail, sendVerifyEmail };
