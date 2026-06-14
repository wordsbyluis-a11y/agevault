const Stripe = require('stripe');

const PRICE_IDS = {
  basic: 'price_1TiArPIytX7fsF2vpQX4bIfv', // $4.99
  full:  'price_1TiArQIytX7fsF2v4CUxL4GH', // $9.99
};

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

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const base = process.env.SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{ price: PRICE_IDS[plan], quantity: 1 }],
      mode: 'payment',
      customer_email: email,
      metadata: { dob, email, plan },
      success_url: `${base}?payment=success&plan=${plan}`,
      cancel_url:  `${base}?payment=cancelled`,
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Stripe error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
