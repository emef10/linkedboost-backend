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

// Claude API Proxy — API key frontend'de görünmez
app.post('/api/claude', async (req, res) => {
  try {
    const { messages, max_tokens } = req.body;
    
    if (!messages) {
      return res.status(400).json({ error: 'messages required' });
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_KEY || '',
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: max_tokens || 1000,
        messages
      })
    });

    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error('Claude proxy error:', err);
    res.status(500).json({ error: err.message });
  }
});
// Aylık kullanım sayacı sıfırlama
app.post('/api/check-reset', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'email required' });

    // Kullanıcının reset_date'ini kontrol et
    const getRes = await fetch(
      `${SUPABASE_URL}/rest/v1/usage_counts?email=eq.${encodeURIComponent(email)}`,
      {
        headers: {
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
        }
      }
    );
    const data = await getRes.json();

    if (data && data.length > 0) {
      const resetDate = new Date(data[0].reset_date);
      const now = new Date();
      const diffDays = (now - resetDate) / (1000 * 60 * 60 * 24);

      // 30 günden fazla geçtiyse sayacı sıfırla
      if (diffDays >= 30) {
        await fetch(
          `${SUPABASE_URL}/rest/v1/usage_counts?email=eq.${encodeURIComponent(email)}`,
          {
            method: 'PATCH',
            headers: {
              'apikey': SUPABASE_SERVICE_KEY,
              'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ count: 0, reset_date: new Date().toISOString() })
          }
        );
        console.log('Sayaç sıfırlandı:', email);
        return res.json({ reset: true });
      }
    }

    res.json({ reset: false });
  } catch (err) {
    console.error('Reset error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`LinkedBoost backend running on port ${PORT}`);
});
