const { render, textRow, ctaRow, brandFromEnv, escape } = require("./base");

/**
 * Generic notice email — fallback template for billing alerts, trial reminders,
 * payment receipts. Compose with a title, message, optional CTA.
 *
 * Params:
 *   - title (string, required) — appears in header + subject prefix
 *   - heading (string, required) — short bold sentence above body
 *   - message (string, required) — body paragraph
 *   - ctaLabel (string, optional) + ctaUrl (string, optional)
 *   - category (string, optional) — used for Resend tag
 */
const noticeEmail = ({ title, heading, message, ctaLabel, ctaUrl, category = "notice" }) => {
  if (!title || !message) throw new Error("title and message are required");
  const brand = brandFromEnv();

  const body = [
    textRow(
      `<p style="margin:0; font-weight:700; color:#111; font-size:20px; text-align:center">${escape(heading || title)}</p>
       <p style="margin:14px 0 0 0">${escape(message)}</p>`
    ),
    ctaLabel && ctaUrl ? ctaRow(ctaLabel, ctaUrl, brand.primaryColor) : "",
  ].join("");

  const html = render({
    preheader: heading || title,
    title,
    body,
  });

  const text = [
    `${brand.name} — ${title}`,
    heading || "",
    "",
    message,
    ctaUrl ? `\n${ctaLabel || "Open"}: ${ctaUrl}` : "",
    `— ${brand.name} Team`,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    subject: `${brand.name} — ${title}`,
    html,
    text,
    tags: [{ name: "category", value: category }],
  };
};

module.exports = { noticeEmail };
