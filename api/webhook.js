const Stripe = require('stripe');
const { Resend } = require('resend');

/* ── collect raw body (needed for Stripe signature verification) ── */
async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(typeof c === 'string' ? Buffer.from(c) : c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/* ── age math ── */
function buildReport(dob, plan) {
  const now  = new Date();
  const born = new Date(dob);
  const ms   = now - born;

  const totalSeconds = Math.floor(ms / 1000);
  const totalMinutes = Math.floor(ms / 60000);
  const totalHours   = Math.floor(ms / 3600000);
  const totalDays    = Math.floor(ms / 86400000);
  const totalWeeks   = Math.floor(totalDays / 7);

  let years  = now.getFullYear() - born.getFullYear();
  let months = now.getMonth() - born.getMonth();
  if (months < 0) { years--; months += 12; }
  const totalMonths = years * 12 + months;
  const days = Math.floor((now - new Date(now.getFullYear(), now.getMonth() - months - (years * 12 - (now.getFullYear() - born.getFullYear()) * 12), born.getDate())) / 86400000);

  const lifePercent = Math.min(((years / 80) * 100).toFixed(1), 100);

  const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const bornDay   = DAYS[born.getDay()];
  const bornMonth = MONTHS[born.getMonth()];

  /* next birthday */
  let nextBd = new Date(now.getFullYear(), born.getMonth(), born.getDate());
  if (nextBd <= now) nextBd.setFullYear(now.getFullYear() + 1);
  const daysUntilBd = Math.ceil((nextBd - now) / 86400000);
  const nextAge = nextBd.getFullYear() - born.getFullYear();

  /* fun stats */
  const heartBeats = Math.floor(totalMinutes * 72).toLocaleString();
  const breaths    = Math.floor(totalMinutes * 16).toLocaleString();

  const fmt = n => Number(n).toLocaleString();

  /* ── email HTML ── */
  const basicStats = `
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:24px 0">
      <tr>
        <td align="center" style="padding:4px">
          <table cellpadding="0" cellspacing="0" style="border-collapse:collapse">
            <tr>
              ${[
                [fmt(years),        'Years'],
                [fmt(totalMonths),  'Months'],
                [fmt(totalDays),    'Days'],
                [fmt(totalHours),   'Hours'],
                [fmt(totalMinutes), 'Minutes'],
              ].map(([n, l]) => `
                <td style="padding:6px;text-align:center;vertical-align:top">
                  <div style="background:#f9f9f9;border:1px solid #e5e5e5;border-radius:10px;padding:14px 10px;min-width:80px">
                    <div style="font-family:'Courier New',monospace;font-size:20px;font-weight:700;color:#111;line-height:1">${n}</div>
                    <div style="font-size:10px;font-weight:600;color:#999;text-transform:uppercase;letter-spacing:.08em;margin-top:5px">${l}</div>
                  </div>
                </td>
              `).join('')}
            </tr>
          </table>
        </td>
      </tr>
    </table>`;

  const fullExtras = plan === 'full' ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:32px 0 0">
      <tr><td style="padding-bottom:20px">
        <h2 style="font-family:sans-serif;font-size:16px;font-weight:700;color:#111;margin:0 0 16px">Your Life in Numbers</h2>
        ${[
          ['Total weeks lived',      fmt(totalWeeks)],
          ['Total seconds lived',    fmt(totalSeconds)],
          ['Estimated heartbeats',   heartBeats],
          ['Estimated breaths',      breaths],
          ['Life elapsed (80yr avg)',lifePercent + '%'],
        ].map(([label, val]) => `
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:8px">
            <tr>
              <td style="font-family:sans-serif;font-size:13px;color:#555;padding:10px 14px;background:#f9f9f9;border-radius:8px 0 0 8px;border:1px solid #e5e5e5;border-right:none">${label}</td>
              <td style="font-family:'Courier New',monospace;font-size:13px;font-weight:700;color:#111;padding:10px 14px;background:#f9f9f9;border-radius:0 8px 8px 0;border:1px solid #e5e5e5;text-align:right;white-space:nowrap">${val}</td>
            </tr>
          </table>`).join('')}
      </td></tr>
    </table>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 0;background:#fffbea;border:1px solid #f5c518;border-radius:12px;padding:0">
      <tr><td style="padding:20px">
        <div style="font-family:sans-serif;font-size:11px;font-weight:700;color:#b8860b;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">Next Birthday</div>
        <div style="font-family:sans-serif;font-size:15px;font-weight:600;color:#111">
          Your ${nextAge}${ordinal(nextAge)} birthday is in <strong style="color:#b8860b">${daysUntilBd} days</strong>
        </div>
        <div style="font-family:sans-serif;font-size:12px;color:#888;margin-top:4px">${MONTHS[nextBd.getMonth()]} ${nextBd.getDate()}, ${nextBd.getFullYear()}</div>
      </td></tr>
    </table>` : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Your AgeVault Report</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#f4f4f5;padding:40px 16px">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)">

        <!-- Header -->
        <tr><td style="background:#09090b;padding:32px 36px;text-align:center">
          <div style="font-size:22px;font-weight:800;color:#f5c518;letter-spacing:-.5px">AgeVault</div>
          <div style="font-size:13px;color:#71717a;margin-top:4px">Your Life Report</div>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:36px">
          <h1 style="font-size:18px;font-weight:700;color:#111;margin:0 0 6px;line-height:1.3">
            Your age has been calculated.
          </h1>
          <p style="font-size:13px;color:#666;margin:0 0 4px">Born: <strong>${bornDay}, ${bornMonth} ${born.getDate()}, ${born.getFullYear()}</strong></p>
          <p style="font-size:13px;color:#666;margin:0 0 24px">Report generated: ${now.toUTCString()}</p>

          ${basicStats}
          ${fullExtras}

          <p style="font-size:12px;color:#999;margin:32px 0 0;border-top:1px solid #e5e5e5;padding-top:20px">
            Thank you for using AgeVault. This report was generated based on the date of birth you provided.<br>
            Questions? <a href="mailto:contact@agevault.com" style="color:#b8860b">contact@agevault.com</a>
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#f9f9f9;padding:16px 36px;border-top:1px solid #e5e5e5;text-align:center">
          <p style="font-size:11px;color:#aaa;margin:0">
            &copy; 2025 AgeVault &middot; <a href="https://howoldami-seven.vercel.app/privacy.html" style="color:#aaa">Privacy</a> &middot; <a href="https://howoldami-seven.vercel.app/terms.html" style="color:#aaa">Terms</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { html, subject: plan === 'full' ? 'Your AgeVault Full Life Report' : 'Your AgeVault Age Report' };
}

function ordinal(n) {
  const s = ['th','st','nd','rd'], v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

/* ── webhook handler ── */
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const rawBody = await getRawBody(req);
  const sig     = req.headers['stripe-signature'];

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return res.status(400).json({ error: `Webhook error: ${err.message}` });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const dob   = session.metadata?.dob;
    const email = session.metadata?.email || session.customer_email || session.customer_details?.email;
    const plan  = session.metadata?.plan || 'basic';

    if (!dob || !email) {
      console.error('Missing dob or email in session metadata', { dob, email });
      return res.status(200).json({ received: true, warning: 'Missing metadata' });
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    const { html, subject } = buildReport(dob, plan);

    /* FROM address — replace with your verified domain once set up in Resend */
    const fromAddr = process.env.RESEND_FROM || 'AgeVault <onboarding@resend.dev>';

    try {
      const result = await resend.emails.send({ from: fromAddr, to: email, subject, html });
      console.log('Email sent:', result.data?.id, '→', email);
    } catch (emailErr) {
      console.error('Email send error:', emailErr);
    }
  }

  return res.status(200).json({ received: true });
};
