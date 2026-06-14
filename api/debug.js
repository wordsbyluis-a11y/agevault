const https = require('https');

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (r) => { resolve(r.statusCode); }).on('error', reject);
  });
}

module.exports = async (req, res) => {
  const key = process.env.STRIPE_SECRET_KEY || '';

  let stripeReach = null;
  try {
    stripeReach = await httpsGet('https://api.stripe.com/');
  } catch(e) {
    stripeReach = 'ERROR: ' + e.message;
  }

  res.json({
    key_prefix:    key.slice(0, 10) || 'MISSING',
    key_length:    key.length,
    node_version:  process.version,
    resend_set:    !!process.env.RESEND_API_KEY,
    webhook_set:   !!process.env.STRIPE_WEBHOOK_SECRET,
    stripe_reach:  stripeReach,
  });
};
