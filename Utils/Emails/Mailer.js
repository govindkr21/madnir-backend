const logger = require("../Logger");

const FROM_DEFAULT = () => process.env.MAIL_FROM || "Madnir <noreply@fialetech.com>";
const REPLY_TO = () => process.env.MAIL_REPLY_TO || "";
const API_KEY = () => process.env.RESEND_API_KEY || "";
const DEV_OVERRIDE = () => (process.env.DEV_MAIL_OVERRIDE || "").trim();

let cached = null;

const getClient = () => {
  if (cached !== null) return cached;
  if (!API_KEY()) {
    cached = false;
    return null;
  }
  try {
    const { Resend } = require("resend");
    cached = new Resend(API_KEY());
    return cached;
  } catch (err) {
    logger.warn("resend package failed to load; running mailer in mock mode:", err.message);
    cached = false;
    return null;
  }
};

const isLive = () => !!getClient();


const sendMail = async ({
  to,
  subject,
  html,
  text,
  cc,
  bcc,
  replyTo,
  idempotencyKey,
  tags,
  attachments,
  scheduledAt,
  from,
}) => {
  if (!to || !subject || (!html && !text)) {
    logger.warn("sendMail called with missing required fields.");
    return { ok: false, error: "missing_fields" };
  }

  const client = getClient();
  if (!client) {
    logger.info(`[MAIL MOCK] to=${Array.isArray(to) ? to.join(",") : to} subject="${subject}"`);
    return { ok: true, mock: true, id: `mock_${Date.now()}` };
  }

  const override = DEV_OVERRIDE().toLowerCase();
  const originalList = (Array.isArray(to) ? to : [to]).map((x) => String(x).toLowerCase());
  const originalTo = originalList.join(",");
  const isRealRedirect = override && originalList.some((addr) => addr !== override);

  let finalTo = Array.isArray(to) ? to : [to];
  let finalCc;
  let finalBcc;
  let finalSubject = subject;
  let finalHtml = html;
  let finalText = text;

  if (override && isRealRedirect) {
    finalTo = [override];
    finalCc = undefined;
    finalBcc = undefined;
    finalSubject = `[DEV → ${originalTo}] ${subject}`;
    const banner = `<div style="background:#fef3c7;color:#92400e;padding:10px 14px;font-family:Arial,sans-serif;font-size:12px;border-radius:6px;margin-bottom:12px"><b>DEV redirect</b> — originally addressed to <b>${originalTo}</b>. Set <code>DEV_MAIL_OVERRIDE=</code> empty in <code>.env</code> to disable.</div>`;
    if (finalHtml) finalHtml = banner + finalHtml;
    if (finalText) finalText = `[DEV redirect — originally to ${originalTo}]\n\n${finalText}`;
    logger.warn(`[MAIL DEV OVERRIDE] to=${originalTo} → ${override} (subject="${subject}")`);
  } else {
    if (cc) finalCc = Array.isArray(cc) ? cc : [cc];
    if (bcc) finalBcc = Array.isArray(bcc) ? bcc : [bcc];
  }

  const payload = {
    from: from || FROM_DEFAULT(),
    to: finalTo,
    subject: finalSubject,
    html: finalHtml,
  };
  if (finalText) payload.text = finalText;
  if (finalCc) payload.cc = finalCc;
  if (finalBcc) payload.bcc = finalBcc;
  const rt = replyTo || REPLY_TO();
  if (rt) payload.replyTo = Array.isArray(rt) ? rt : [rt];
  if (tags) payload.tags = tags;
  if (attachments) payload.attachments = attachments;
  if (scheduledAt) payload.scheduledAt = scheduledAt;
  if (idempotencyKey) payload.idempotencyKey = String(idempotencyKey).slice(0, 256);

  const { data, error } = await client.emails.send(payload);
  if (error) {
    logger.error(`Resend send failed: ${error.name || ""} ${error.message || ""}`);
    return { ok: false, error: error.message || "send_failed" };
  }
  return { ok: true, id: data?.id };
};

module.exports = { sendMail, isLive };
