/**
 * PixelTap Bot Server
 * Handles Telegram Stars payments for premium features.
 *
 * Env vars needed:
 *   BOT_TOKEN  - Telegram bot token from BotFather
 *   PORT       - server port (Railway sets this automatically)
 */

const BOT_TOKEN = process.env.BOT_TOKEN;
const PORT = process.env.PORT || 3000;
const TG_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

// --- Premium products ---
const PRODUCTS = {
  'pro_pack': {
    title: 'PixelTap Pro',
    description: 'Unlock 50 layers, 512x512 canvas, extra palettes',
    price: 50, // Stars
  },
  'brush_pack': {
    title: 'Brush Pack',
    description: '12 custom pixel brushes & stamps',
    price: 25,
  },
  'palette_pack': {
    title: 'Color Palettes',
    description: '20 curated color palettes for pixel art',
    price: 15,
  },
};

// --- Telegram API helper ---
async function tgRequest(method, body) {
  const res = await fetch(`${TG_API}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.ok) console.error(`TG API error [${method}]:`, data);
  return data;
}

// --- Create Stars invoice link ---
async function createInvoice(productId, userId) {
  const product = PRODUCTS[productId];
  if (!product) return null;

  const result = await tgRequest('createInvoiceLink', {
    title: product.title,
    description: product.description,
    payload: JSON.stringify({ productId, userId, ts: Date.now() }),
    currency: 'XTR', // XTR = Telegram Stars
    prices: [{ label: product.title, amount: product.price }],
  });

  return result.ok ? result.result : null;
}

// --- Process webhook updates ---
async function handleUpdate(update) {
  // Handle /start command
  if (update.message?.text === '/start') {
    await tgRequest('sendMessage', {
      chat_id: update.message.chat.id,
      text: 'Welcome to PixelTap! Tap the button below to open the app.',
    });
    return;
  }

  // Handle pre-checkout query (MUST answer within 10 seconds)
  if (update.pre_checkout_query) {
    await tgRequest('answerPreCheckoutQuery', {
      pre_checkout_query_id: update.pre_checkout_query.id,
      ok: true,
    });
    return;
  }

  // Handle successful payment
  if (update.message?.successful_payment) {
    const payment = update.message.successful_payment;
    const payload = JSON.parse(payment.invoice_payload);
    const userId = update.message.from.id;
    const productId = payload.productId;

    console.log(`Payment OK: user=${userId} product=${productId} stars=${payment.total_amount}`);

    await tgRequest('sendMessage', {
      chat_id: update.message.chat.id,
      text: `Thanks! ${PRODUCTS[productId]?.title || 'Item'} unlocked. Open PixelTap to see your new features!`,
    });
    return;
  }
}

// --- Simple HTTP server (no dependencies) ---
const http = require('http');

const server = http.createServer(async (req, res) => {
  // Health check
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('PixelTap Bot OK');
    return;
  }

  // API: create invoice (called from Mini App frontend)
  if (req.method === 'POST' && req.url === '/api/invoice') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { productId, userId } = JSON.parse(body);
        const invoiceLink = await createInvoice(productId, userId);
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        });
        res.end(JSON.stringify({ ok: !!invoiceLink, invoiceLink }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  // API: list products (called from Mini App frontend)
  if (req.method === 'GET' && req.url === '/api/products') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(JSON.stringify({ ok: true, products: PRODUCTS }));
    return;
  }

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  // Telegram webhook
  if (req.method === 'POST' && req.url === '/webhook') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const update = JSON.parse(body);
        await handleUpdate(update);
      } catch (e) {
        console.error('Webhook error:', e);
      }
      res.writeHead(200);
      res.end('ok');
    });
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, '0.0.0.0', async () => {
  console.log(`PixelTap Bot running on 0.0.0.0:${PORT}`);

  // Set webhook will be done manually after deploy
  // (need the Railway URL first)
});
