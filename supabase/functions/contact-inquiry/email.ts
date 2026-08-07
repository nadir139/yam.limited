// The two emails the contact form sends, and the shell they share.
//
// Written as tables with inline styles, which looks like 2004 and is not a
// mistake: Gmail strips <style> blocks in some clients, Outlook renders through
// Word's HTML engine, and neither flexbox nor grid can be relied on. A layout
// that survives everywhere is worth more than one that is elegant in a browser
// and broken in the inbox the enquiry actually lands in.
//
// Colours are the site's own tokens converted from HSL, so the email and the
// page are the same brand rather than two guesses at it:
//
//   --primary  215 50% 23%  -> #1D3658
//   --accent   185 60% 40%  -> #2999A3

export const BRAND = {
  navy: "#1D3658",
  teal: "#2999A3",
  ink: "#171D26",
  muted: "#5A6675",
  panel: "#F3F5F7",
  border: "#DAE0E7",
  page: "#F0F2F5",
  white: "#FFFFFF",
} as const;

const LOGO_URL = "https://yam.limited/logo.png";
const SITE_URL = "https://yam.limited";
const CONTACT_EMAIL = "info@yam.limited";
const PHONE_DISPLAY = "+39 338 816 2035";
const WHATSAPP_URL = "https://wa.me/393388162035";

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * The wrapper: navy header with the mark, white card, muted footer.
 *
 * `preheader` is the grey line of text an inbox shows next to the subject. Left
 * out, clients scrape the first words of the body instead — usually "View this
 * email in your browser" or, here, a street address.
 */
function shell(opts: { preheader: string; title: string; body: string }): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(opts.title)}</title>
</head>
<body style="margin:0;padding:0;background-color:${BRAND.page};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;font-size:1px;line-height:1px;">${escapeHtml(opts.preheader)}</div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${BRAND.page};padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;border-collapse:collapse;">

          <!-- Header -->
          <tr>
            <td style="background-color:${BRAND.navy};padding:28px 32px;border-radius:8px 8px 0 0;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <!-- The mark is black-stroked, drawn for the light marketing
                       page. The app sidebar knocks it white with a CSS filter;
                       no email client supports filter, so on navy it would be
                       dark on dark. A white chip is the version that survives
                       Outlook, and it reads as deliberate rather than broken. -->
                  <td width="52" align="center" valign="middle"
                      style="background-color:#FFFFFF;border-radius:8px;padding:7px;">
                    <img src="${LOGO_URL}" width="38" height="38" alt="YAM"
                         style="display:block;width:38px;height:38px;border:0;">
                  </td>
                  <td valign="middle" style="padding-left:14px;">
                    <div style="font-family:Helvetica,Arial,sans-serif;font-size:21px;font-weight:700;color:#FFFFFF;letter-spacing:-0.4px;line-height:1.1;">YAM</div>
                    <div style="font-family:Helvetica,Arial,sans-serif;font-size:11px;color:#A9BBD0;letter-spacing:0.7px;text-transform:uppercase;padding-top:3px;">Yacht Architectural Management</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background-color:${BRAND.white};padding:32px;border-left:1px solid ${BRAND.border};border-right:1px solid ${BRAND.border};">
              ${opts.body}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:${BRAND.panel};padding:22px 32px;border:1px solid ${BRAND.border};border-top:0;border-radius:0 0 8px 8px;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.7;color:${BRAND.muted};">
              <a href="${SITE_URL}" style="color:${BRAND.navy};text-decoration:none;font-weight:700;">yam.limited</a>
              &nbsp;·&nbsp;
              <a href="mailto:${CONTACT_EMAIL}" style="color:${BRAND.muted};text-decoration:none;">${CONTACT_EMAIL}</a>
              &nbsp;·&nbsp;
              <a href="${WHATSAPP_URL}" style="color:${BRAND.muted};text-decoration:none;">${PHONE_DISPLAY}</a>
              <div style="padding-top:6px;color:#8794A5;">Owner's representation &amp; refit management · Mediterranean and worldwide</div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

const H1 = `font-family:Helvetica,Arial,sans-serif;font-size:22px;font-weight:700;color:${BRAND.ink};margin:0 0 14px;line-height:1.3;`;
const P = `font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.65;color:${BRAND.ink};margin:0 0 14px;`;
const SMALL = `font-family:Helvetica,Arial,sans-serif;font-size:13px;line-height:1.6;color:${BRAND.muted};margin:0;`;

/** A label/value row in the details panel. */
function row(label: string, value: string, isLink?: "mailto" | "tel"): string {
  const shown = isLink === "mailto"
    ? `<a href="mailto:${escapeHtml(value)}" style="color:${BRAND.teal};text-decoration:none;">${escapeHtml(value)}</a>`
    : isLink === "tel"
    ? `<a href="tel:${escapeHtml(value.replace(/\s/g, ""))}" style="color:${BRAND.teal};text-decoration:none;">${escapeHtml(value)}</a>`
    : escapeHtml(value);
  return `<tr>
    <td style="padding:0 0 10px;font-family:Helvetica,Arial,sans-serif;font-size:12px;text-transform:uppercase;letter-spacing:0.6px;color:${BRAND.muted};width:120px;" valign="top">${escapeHtml(label)}</td>
    <td style="padding:0 0 10px;font-family:Helvetica,Arial,sans-serif;font-size:15px;color:${BRAND.ink};" valign="top">${shown}</td>
  </tr>`;
}

function button(href: string, text: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 4px;">
    <tr><td style="background-color:${BRAND.teal};border-radius:6px;">
      <a href="${href}" style="display:inline-block;padding:13px 26px;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:700;color:#FFFFFF;text-decoration:none;">${escapeHtml(text)}</a>
    </td></tr>
  </table>`;
}

export interface Inquiry {
  name: string;
  email: string;
  phone?: string;
  projectType: string;
  message: string;
}

/** What lands in info@yam.limited. Built to be answered from a phone. */
export function notificationEmail(inquiry: Inquiry, label: string) {
  const firstName = inquiry.name.split(/\s+/)[0] || inquiry.name;
  const replySubject = encodeURIComponent(`Re: your enquiry to YAM — ${label}`);

  const body = `
    <h1 style="${H1}">New enquiry — ${escapeHtml(label)}</h1>
    <p style="${P}">${escapeHtml(inquiry.name)} got in touch through yam.limited.</p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background-color:${BRAND.panel};border:1px solid ${BRAND.border};border-radius:6px;padding:18px 20px;margin:0 0 20px;">
      <tr><td>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          ${row("Name", inquiry.name)}
          ${row("Email", inquiry.email, "mailto")}
          ${row("Phone", inquiry.phone || "Not provided", inquiry.phone ? "tel" : undefined)}
          ${row("Project", label)}
        </table>
      </td></tr>
    </table>

    <div style="border-left:3px solid ${BRAND.teal};padding:2px 0 2px 16px;margin:0 0 22px;">
      <div style="font-family:Helvetica,Arial,sans-serif;font-size:12px;text-transform:uppercase;letter-spacing:0.6px;color:${BRAND.muted};padding-bottom:6px;">Message</div>
      <div style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.65;color:${BRAND.ink};">${escapeHtml(inquiry.message).replace(/\n/g, "<br>")}</div>
    </div>

    ${button(`mailto:${inquiry.email}?subject=${replySubject}`, `Reply to ${firstName}`)}
    <p style="${SMALL}">${escapeHtml(firstName)} has already had an automatic acknowledgement.</p>
  `;

  const text = [
    `New enquiry — ${label}`,
    "",
    `Name:    ${inquiry.name}`,
    `Email:   ${inquiry.email}`,
    `Phone:   ${inquiry.phone || "Not provided"}`,
    `Project: ${label}`,
    "",
    "Message:",
    inquiry.message,
  ].join("\n");

  return {
    subject: `New enquiry — ${label} — ${inquiry.name}`,
    html: shell({
      preheader: `${inquiry.name}: ${inquiry.message.slice(0, 110)}`,
      title: `New enquiry — ${label}`,
      body,
    }),
    text,
  };
}

/**
 * What the person who filled in the form gets back.
 *
 * It quotes their own message deliberately. An acknowledgement that only says
 * "we received it" leaves them wondering what, exactly, was received — and if
 * the reply takes a day, this is the only record they have of what they asked.
 */
export function acknowledgementEmail(inquiry: Inquiry, label: string) {
  const firstName = inquiry.name.split(/\s+/)[0] || inquiry.name;

  const body = `
    <h1 style="${H1}">Thank you, ${escapeHtml(firstName)}.</h1>
    <p style="${P}">
      Your enquiry has reached us and a person — not an autoresponder — will read
      it. You can expect a reply within one working day.
    </p>
    <p style="${P}">
      If it is urgent, WhatsApp is the fastest way to reach us:
      <a href="${WHATSAPP_URL}" style="color:${BRAND.teal};text-decoration:none;font-weight:700;">${PHONE_DISPLAY}</a>.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background-color:${BRAND.panel};border:1px solid ${BRAND.border};border-radius:6px;padding:18px 20px;margin:6px 0 22px;">
      <tr><td>
        <div style="font-family:Helvetica,Arial,sans-serif;font-size:12px;text-transform:uppercase;letter-spacing:0.6px;color:${BRAND.muted};padding-bottom:4px;">What you sent us · ${escapeHtml(label)}</div>
        <div style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.65;color:${BRAND.ink};padding-top:8px;">${escapeHtml(inquiry.message).replace(/\n/g, "<br>")}</div>
      </td></tr>
    </table>

    <p style="${P}">
      YAM is owner's representation and refit management led by a naval
      architect — First Class Honours in Yacht &amp; Powercraft Design, and a
      decade between the yard and the rail.
    </p>
    ${button(SITE_URL, "See how we work")}
    <p style="${SMALL}">
      You are receiving this because this address was used to contact us at
      yam.limited. If that was not you, simply ignore it — nothing is subscribed.
    </p>
  `;

  const text = [
    `Thank you, ${firstName}.`,
    "",
    "Your enquiry has reached us and a person will read it. You can expect a",
    "reply within one working day.",
    "",
    `If it is urgent, WhatsApp is fastest: ${PHONE_DISPLAY}`,
    "",
    `What you sent us (${label}):`,
    inquiry.message,
    "",
    `yam.limited · ${CONTACT_EMAIL}`,
  ].join("\n");

  return {
    subject: "Thank you for contacting YAM",
    html: shell({
      preheader: "We have your enquiry — a reply is coming within one working day.",
      title: "Thank you for contacting YAM",
      body,
    }),
    text,
  };
}
