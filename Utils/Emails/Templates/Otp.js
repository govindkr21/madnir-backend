const { render, textRow, otpRow, brandFromEnv, escape } = require("./base");
const crypto = require("crypto");

/**
 * Otp email — used by forgot-password flows.
 *
 * Params:
 *   - recipientName (string, optional)
 *   - otp (string, required)
 *   - purpose (string, e.g. "password reset" / "login confirmation")
 *   - actorRole (string, "admin" | "doctor" | "staff")
 *   - ttlMinutes (number, default 10)
 *
 * Returns { subject, html, text, idempotencyKey, tags }.
 */
const otpEmail = ({
  recipientName = "",
  otp,
  purpose = "password reset",
  actorRole = "user",
  ttlMinutes = 10,
}) => {
  if (!otp) throw new Error("otp is required");
  const brand = brandFromEnv();
  const safeOtp = escape(otp);
  const safeName = escape(recipientName || "there");
  const safePurpose = escape(purpose);
  const subject = `${brand.name} ${purpose.replace(/\b\w/g, (c) => c.toUpperCase())}`;

  const body = [
    textRow(
      `<p style="text-align:center; margin:0">Hi <b>${safeName}</b>,</p>
       <p style="text-align:center; margin:12px 0 0 0">Use the code below to complete your <b>${safePurpose}</b>. It expires in <b>${ttlMinutes} minutes</b>.</p>`
    ),
    otpRow(safeOtp, brand.primaryColor),
    textRow(
      `<p style="margin:0; font-size:14px; color:#888; text-align:center">If you did not request this, you can safely ignore this email — no changes have been made.</p>`
    ),
  ].join("");

  const html = render({
    preheader: `Your ${brand.name} ${purpose} code is ${otp}`,
    title: "Verify with OTP",
    body,
  });

  const text = [
    `${brand.name} — ${purpose}`,
    ``,
    `Hi ${recipientName || "there"},`,
    `Use this code to complete your ${purpose}: ${otp}`,
    `The code expires in ${ttlMinutes} minutes.`,
    ``,
    `If you didn't request this, ignore this email — no changes have been made.`,
    `— ${brand.name} Team`,
  ].join("\n");

  return {
    subject,
    html,
    text,
    idempotencyKey: `otp-${actorRole}/${crypto.createHash("sha256").update(String(otp)).digest("hex")}`,
    tags: [
      { name: "category", value: "otp" },
      { name: "actor_role", value: String(actorRole) },
    ],
  };
};

module.exports = { otpEmail };
