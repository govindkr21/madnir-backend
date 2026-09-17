const { render, textRow, ctaRow, linkRow, brandFromEnv, escape } = require("./base");

/**
 * Invite email — used when an org owner invites a doctor/staff to join.
 *
 * Params:
 *   - inviteeEmail (string, required, just used in the subject/body)
 *   - inviteUrl (string, required) — accept-invite link
 *   - inviterName (string, optional)
 *   - organizationName (string, required)
 *   - role (string, "doctor" | "staff")
 *   - expiresAt (Date | string, optional)
 *
 * Returns { subject, html, text, idempotencyKey, tags }.
 */
const inviteEmail = ({
  inviteeEmail,
  inviteUrl,
  inviterName = "",
  organizationName,
  role = "doctor",
  expiresAt,
}) => {
  if (!inviteUrl) throw new Error("inviteUrl is required");
  if (!organizationName) throw new Error("organizationName is required");

  const brand = brandFromEnv();
  const subject = `You're invited to join ${organizationName} on ${brand.name}`;

  const expiryLine = expiresAt
    ? `<p style="margin:0; font-size:14px; color:#888; text-align:center">This invitation expires on <b>${escape(
        new Date(expiresAt).toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" })
      )}</b>.</p>`
    : "";

  const body = [
    textRow(
      `<p style="text-align:center; margin:0">${
        inviterName ? `<b>${escape(inviterName)}</b>` : "An organization owner"
      } has invited you to join <b>${escape(organizationName)}</b> on ${brand.name} as a <b>${escape(role)}</b>.</p>`
    ),
    ctaRow(`Accept invitation`, inviteUrl, brand.primaryColor),
    linkRow(inviteUrl),
    textRow(expiryLine),
  ].join("");

  const html = render({
    preheader: `${inviterName || "Your organization"} invited you to join ${organizationName} on ${brand.name}`,
    title: "You're invited",
    body,
  });

  const text = [
    `${brand.name} — Invitation to ${organizationName}`,
    ``,
    `${inviterName || "An organization owner"} has invited you to join ${organizationName} on ${brand.name} as a ${role}.`,
    ``,
    `Accept the invitation here:`,
    inviteUrl,
    ``,
    expiresAt
      ? `This invitation expires on ${new Date(expiresAt).toLocaleDateString("en-IN")}.`
      : "",
    `— ${brand.name} Team`,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    subject,
    html,
    text,
    idempotencyKey: `invite/${(inviteeEmail || "").toLowerCase()}/${Math.floor(Date.now() / (5 * 60 * 1000))}`,
    tags: [
      { name: "category", value: "invite" },
      { name: "role", value: String(role) },
    ],
  };
};

module.exports = { inviteEmail };
