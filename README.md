# Ignite Automations — SaaS Platform

AI-powered ordering system for restaurants. Multi-tenant, multi-channel (Voice, SMS, Telegram, WhatsApp, Web).

## Stack

| Layer | Technology |
|-------|-----------|
| API | Node.js + Express + TypeScript |
| AI | Claude claude-sonnet-4-6 (Anthropic) |
| Database | Supabase (Postgres + Auth + RLS) |
| Cache / Sessions | Upstash Redis (serverless) |
| Compute | Railway (Docker) |
| Edge / DNS | Cloudflare Workers |
| Voice / SMS | Vonage (per tenant) |
| Billing | Stripe |

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/your-org/ignite-automations
cd ignite-automations
cp .env.example .env
# Fill in your .env values
npm install
```

### 2. Set up Supabase

1. Create a new project at supabase.com
2. Go to SQL Editor and run `packages/db/migrations/001_initial_schema.sql`
3. Copy your project URL and service key to `.env`

### 3. Set up Upstash Redis

1. Create a database at upstash.com (free tier works for dev)
2. Copy REST URL and token to `.env`

### 4. Run locally

```bash
npm run dev:api
# API runs on http://localhost:3001
```

### 5. Deploy to Railway

```bash
# Install Railway CLI
npm install -g @railway/cli
railway login
railway init
railway up
```

### 6. Deploy Cloudflare Worker

```bash
cd infrastructure
npx wrangler deploy cloudflare-worker.ts
```

## Onboarding a new restaurant client

```sql
-- 1. Create tenant
INSERT INTO tenants (business_name, ai_persona_name, plan, vonage_api_key, vonage_api_secret, vonage_number)
VALUES ('Mario''s Pizza', 'Maria', 'growth', 'VONAGE_KEY', 'VONAGE_SECRET', '+14423209666');

-- 2. Create menu items
INSERT INTO menu_items (tenant_id, name, price, category) VALUES
  ('<tenant_id>', 'Pizza Margherita', 12.99, 'Pizzas'),
  ('<tenant_id>', 'Pizza Pepperoni', 14.99, 'Pizzas'),
  ('<tenant_id>', 'Coca-Cola', 2.50, 'Bebidas');
```

Then configure Vonage webhooks to point to:
- SMS: `https://your-api.railway.app/webhooks/vonage/sms/<tenant_id>`
- Voice answer: `https://your-api.railway.app/webhooks/vonage/voice/<tenant_id>/answer`
- Voice event: `https://your-api.railway.app/webhooks/vonage/voice/<tenant_id>`
- Telegram: `https://your-api.railway.app/webhooks/telegram/<tenant_id>`

## API Reference

### Webhooks (public, no auth)
- `POST /webhooks/vonage/sms/:tenantId`
- `POST /webhooks/vonage/voice/:tenantId`
- `POST /webhooks/vonage/voice/:tenantId/answer`
- `POST /webhooks/telegram/:tenantId`
- `POST /webhooks/web/:tenantId`

### Authenticated (requires Supabase JWT)
- `GET /api/tenants/me` — tenant config
- `PATCH /api/tenants/me` — update config
- `GET /api/tenants/me/stats` — 30-day stats
- `GET /api/tenants/me/menu` — menu items
- `POST /api/tenants/me/menu` — add menu item
- `GET /api/orders` — list orders (paginated)
- `PATCH /api/orders/:id/status` — update order status

## Pricing Tiers

| Plan | Price | Channels | Orders/mo |
|------|-------|----------|-----------|
| Starter | $297/mo | 1 channel | 500 |
| Growth | $597/mo | 3 channels | Unlimited |
| Scale | $1,497/mo | All + WhatsApp | Unlimited + white-label |

## Cost per tenant (infrastructure)

| Component | Monthly est. |
|-----------|-------------|
| Railway (API + n8n) | ~$25 |
| Supabase Pro | ~$25 |
| Upstash Redis | ~$0-10 |
| Cloudflare | ~$5 |
| Anthropic API (per client) | ~$10-25 |
| Vonage (per client) | ~$7-15 |
| **Total per 10 clients** | **~$220-280** |

Margin at 10 clients (Growth plan mix): ~92%
