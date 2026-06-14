const https = require('https');
const querystring = require('querystring');

const PRICE_IDS = {
  basic: 'price_1TiArPIytX7fsF2vpQX4bIfv',
  full:  'price_1TiArQIytX7fsF2v4CUxL4GH',
};

function stripePost(path, params, secretKey) {
  const body = querystring.stringify(params);
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.stripe.com',
      port: 443,
      path,
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(secretKey + ':').toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', c => (data += c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (e) { reject(new Error('Bad JSON: ' + data)); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body = '';
  await new Promise((resolve, reject) => {
    req.on('data', c => (body += c));
    req.on('end', resolve);
    req.on('error', reject);
  });

  let dob, email, plan;
  try {
    ({ dob, email, plan } = JSON.parse(body));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  if (!dob || !email || !PRICE_IDS[plan]) {
    return res.status(400).json({ error: 'Missing dob, email, or plan' });
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return res.status(500).json({ error: 'Stripe key not set' });

  const base = process.env.SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

  try {
    const result = await stripePost('/v1/checkout/sessions', {
      'payment_method_types[]': 'card',
      'line_items[0][price]': PRICE_IDS[plan],
      'line_items[0][quantity]': '1',
      'mode': 'payment',
      'customer_email': email,
      'metadata[dob]': dob,
      'metadata[email]': email,
      'metadata[plan]': plan,
      'success_url': `${base}?payment=success&plan=${plan}`,
      'cancel_url': `${base}?payment=cancelled`,
    }, secretKey);

    if (result.status !== 200) {
      console.error('Stripe error:', result.body);
      return res.status(500).json({ error: result.body?.error?.message || 'Stripe error' });
    }

    return res.status(200).json({ url: result.body.url });
  } catch (err) {
    console.error('Request error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
