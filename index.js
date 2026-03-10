const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

const SUPABASE_URL = 'https://roxdpqfkylloirdeocbo.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const LEMON_SECRET = process.env.LEMON_WEBHOOK_SECRET || '';

app.use(cors());
app.use(express.json({ type: '*/*' }));
app.use(express.raw({ type: 'application/json' }));

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'LinkedBoost Backend Running' });
});

// Lemon Squeezy Webhook
app.post('/webhook/lemonsqueezy', async (req, res) => {
  try {
    const signature = req.headers['x-signature'];
    const body = JSON.stringify(req.body);

    // Verify webhook signature
    if (LEMON_SECRET) {
      const hmac = crypto.createHmac('sha256', LEMON_SECRET);
      const digest = hmac.update(body).digest('hex');
      if (signature !== digest) {
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }

    const event = req.body;
    const eventName = event.meta?.event_name;

    console.log('Webhook received:', eventName);

    // Handle subscription created or order completed
    if (eventName === 'order_created' || eventName === 'subscription_created') {
      const customerEmail = event.data?.attributes?.user_email || 
                           event.data?.attributes?.customer_email;
      const variantId = event.data?.attributes?.first_order_item?.variant_id ||
                       event.data?.attributes?.variant_id;

      if (!customerEmail) {
        return res.status(400).json({ error: 'No email found' });
      }

      // Determine plan based on variant
      const plan = 'pro'; // Default to pro for any payment

      // Update user plan in Supabase
      const updateRes = await fetch(
        `${SUPABASE_URL}/rest/v1/profiles?email=eq.${encodeURIComponent(customerEmail)}`,
        {
          method: 'PATCH',
          headers: {
            'apikey': SUPABASE_SERVICE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify({ plan })
        }
      );

      console.log('Plan updated for:', customerEmail, '→', plan);
    }

    res.json({ received: true });
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`LinkedBoost backend running on port ${PORT}`);
});
