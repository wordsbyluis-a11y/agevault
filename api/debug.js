module.exports = async (req, res) => {
  const key = process.env.STRIPE_SECRET_KEY || '';
  res.json({
    key_prefix:    key.slice(0, 10) || 'MISSING',
    key_length:    key.length,
    node_version:  process.version,
    resend_set:    !!process.env.RESEND_API_KEY,
    webhook_set:   !!process.env.STRIPE_WEBHOOK_SECRET,
  });
};
