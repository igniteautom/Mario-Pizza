import express from 'express'
import { webhookRouter } from './routes/webhooks.js'
import { tenantRouter } from './routes/tenants.js'
import { ordersRouter } from './routes/orders.js'
import { authMiddleware } from './middleware/auth.js'
import { rateLimitMiddleware } from './middleware/rateLimit.js'

const app = express()

app.use((req, res, next) => {
  const allowed = [
    'https://mario-pizza-dashboard-production.up.railway.app',
    'http://localhost:3000'
  ]
  const origin = req.headers.origin
  if (origin && allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.sendStatus(200)
  next()
})

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.use('/webhooks', webhookRouter)
app.use('/api/tenants', authMiddleware, rateLimitMiddleware, tenantRouter)
app.use('/api/orders', authMiddleware, rateLimitMiddleware, ordersRouter)
app.get('/health', (_req, res) => res.json({ status: 'ok', ts: Date.now() }))

const PORT = process.env.PORT || 3001
app.listen(PORT, () => console.log(`Ignite API running on :${PORT}`))