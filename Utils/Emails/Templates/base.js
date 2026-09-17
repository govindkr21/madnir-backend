const escape = (s) =>
  String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const brandFromEnv = () => ({
  name: process.env.BRAND_NAME || "RxMind",
  tagline: process.env.BRAND_TAGLINE || "",
  primaryColor: process.env.BRAND_COLOR_PRIMARY || "#0F766E",
  logoUrl: process.env.BRAND_LOGO_URL || "",
  supportEmail: process.env.SUPPORT_EMAIL || process.env.MAIL_REPLY_TO || "harshvaidya345@gmail.com",
  websiteUrl: process.env.FRONTEND_URL || "http://localhost:5173",
});

/**
 * Wraps title + body html into a Lato-styled email shell (adapted from the
 * provided Wilyer reference; rebranded + parameterised).
 *
 *   render({ preheader, title, body, primaryColor, brandName, logoUrl })
 */
const render = ({
  preheader = "",
  title = "",
  body = "",
  primaryColor,
  brandName,
  logoUrl,
}) => {
  const brand = brandFromEnv();
  const color = primaryColor || brand.primaryColor;
  const name = brandName || brand.name;
  const logo = logoUrl != null ? logoUrl : brand.logoUrl;
  const safeTitle = escape(title);

  return `<!DOCTYPE html>
<html>
  <head>
    <title>${safeTitle}</title>
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <style type="text/css">
      @media screen {
        @font-face { font-family: "Lato"; font-style: normal; font-weight: 400; src: local("Lato Regular"), local("Lato-Regular"), url(https://fonts.gstatic.com/s/lato/v11/qIIYRU-oROkIk8vfvxw6QvesZW2xOQ-xsNqO47m55DA.woff) format("woff"); }
        @font-face { font-family: "Lato"; font-style: normal; font-weight: 700; src: local("Lato Bold"), local("Lato-Bold"), url(https://fonts.gstatic.com/s/lato/v11/qdgUG4U09HnJwhYI-uK18wLUuEpTyoUstqEm5AMlJo4.woff) format("woff"); }
      }
      body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
      table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
      img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
      table { border-collapse: collapse !important; }
      body { height: 100% !important; margin: 0 !important; padding: 0 !important; width: 100% !important; }
      a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; font-size: inherit !important; font-family: inherit !important; font-weight: inherit !important; line-height: inherit !important; }
      @media screen and (max-width: 600px) { h1 { font-size: 32px !important; line-height: 36px !important; } }
      div[style*="margin: 16px 0;"] { margin: 0 !important; }
    </style>
  </head>
  <body style="background-color:#f4f4f4; margin:0 !important; padding:0 !important;">
    <div style="display:none; font-size:1px; color:#fefefe; line-height:1px; font-family:'Lato',Helvetica,Arial,sans-serif; max-height:0px; max-width:0px; opacity:0; overflow:hidden;">${escape(preheader)}</div>

    <table border="0" cellpadding="0" cellspacing="0" width="100%">
      <tr>
        <td bgcolor="${color}" align="center">
          <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:600px">
            <tr><td align="center" valign="top" style="padding:40px 10px 40px 10px"></td></tr>
          </table>
        </td>
      </tr>
      <tr>
        <td bgcolor="${color}" align="center" style="padding:0px 10px 0px 10px">
          <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:600px">
            <tr>
              <td bgcolor="#ffffff" align="center" valign="top" style="padding:40px 20px 20px 20px; border-radius:10px 10px 0 0; color:#111111; font-family:'Lato',Helvetica,Arial,sans-serif; font-size:48px; font-weight:400; letter-spacing:2px; line-height:48px;">
                ${logo ? `<img src="${escape(logo)}" width="125" height="120" alt="${escape(name)}" style="display:block;border:0px"/>` : `<div style="font-size:24px;font-weight:800;letter-spacing:2px;color:${color}">${escape(name).toUpperCase()}</div>`}
                <h1 style="font-size:36px; font-weight:600; margin:8px 0 0 0;">${safeTitle}</h1>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td bgcolor="#f4f4f4" align="center" style="padding:0px 10px 0px 10px">
          <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:600px">
            ${body}
            <tr>
              <td bgcolor="#ffffff" align="left" style="padding:0px 30px 20px 30px; color:#666666; font-family:'Lato',Helvetica,Arial,sans-serif; font-size:16px; font-weight:400; line-height:24px;">
                <p style="margin:0">If you have any questions, just reach out to <a href="mailto:${escape(brand.supportEmail)}" style="color:${color};text-decoration:none;font-weight:700">${escape(brand.supportEmail)}</a> &mdash; we're always happy to help.</p>
              </td>
            </tr>
            <tr>
              <td bgcolor="#ffffff" align="left" style="padding:0px 30px 40px 30px; border-radius:0 0 10px 10px; color:#666666; font-family:'Lato',Helvetica,Arial,sans-serif; font-size:16px; font-weight:400; line-height:24px;">
                <p style="margin:1">Cheers,<br/>${escape(name)} Team</p>
              </td>
            </tr>
            <tr><td style="height:32px"></td></tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
};

// Reusable body fragments
const textRow = (html) => `
  <tr>
    <td bgcolor="#ffffff" align="left" style="padding:20px 30px 10px 30px; color:#444; font-family:'Lato',Helvetica,Arial,sans-serif; font-size:17px; font-weight:400; line-height:25px;">
      ${html}
    </td>
  </tr>`;

const otpRow = (otp, color) => `
  <tr>
    <td bgcolor="#ffffff" align="center" style="padding:20px 30px 40px 30px;">
      <div style="display:inline-block; padding:18px 36px; border-radius:8px; background:${color}; color:#fff; font-family:'Lato',Helvetica,Arial,sans-serif; font-size:32px; font-weight:800; letter-spacing:10px;">${escape(otp)}</div>
    </td>
  </tr>`;

const ctaRow = (label, url, color) => `
  <tr>
    <td bgcolor="#ffffff" align="center" style="padding:20px 30px 40px 30px;">
      <a href="${escape(url)}" target="_blank" rel="noreferrer" style="display:inline-block; padding:14px 28px; border-radius:8px; background:${color}; color:#fff; text-decoration:none; font-family:'Lato',Helvetica,Arial,sans-serif; font-size:16px; font-weight:700;">${escape(label)}</a>
    </td>
  </tr>`;

const linkRow = (url) => `
  <tr>
    <td bgcolor="#ffffff" align="left" style="padding:0 30px 20px 30px; color:#666; font-family:'Lato',Helvetica,Arial,sans-serif; font-size:13px; line-height:20px; word-break:break-all;">
      Or paste this link in your browser:<br/>
      <a href="${escape(url)}" style="color:#0F766E">${escape(url)}</a>
    </td>
  </tr>`;

module.exports = { render, textRow, otpRow, ctaRow, linkRow, brandFromEnv, escape };
