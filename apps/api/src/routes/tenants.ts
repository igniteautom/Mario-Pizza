import { Router } from 'express'
import { supabase } from '../lib/supabase.js'
import { z } from 'zod'

export const tenantRouter = Router()

const updateSchema = z.object({
  business_name: z.string().min(1).max(100).optional(),
  ai_persona_name: z.string().min(1).max(50).optional(),
  vonage_number: z.string().optional(),
  telegram_bot_token: z.string().optional(),
  vonage_api_key: z.string().optional(),
  vonage_api_secret: z.string().optional(),
})

tenantRouter.get('/me', async (req, res) => {
  const { tenantId } = req.user!
  const { data, error } = await supabase
    .from('tenants')
    .select('id, business_name, ai_persona_name, plan, vonage_number, created_at')
    .eq('id', tenantId)
    .single()
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

tenantRouter.patch('/me', async (req, res) => {
  const { tenantId, role } = req.user!
  if (role !== 'admin') return res.status(403).json({ error: 'Admin only' })

  const parsed = updateSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  const { data, error } = await supabase
    .from('tenants')
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq('id', tenantId)
    .select('id, business_name, ai_persona_name, plan, vonage_number')
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

tenantRouter.get('/me/stats', async (req, res) => {
  const { tenantId } = req.user!
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const [ordersRes, revenueRes] = await Promise.all([
    supabase
      .from('orders')
      .select('id, channel, status', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .gte('created_at', since),
    supabase
      .from('orders')
      .select('total')
      .eq('tenant_id', tenantId)
      .gte('created_at', since)
      .neq('status', 'cancelled'),
  ])

  const byChannel = ordersRes.data?.reduce((acc: Record<string, number>, o) => {
    acc[o.channel] = (acc[o.channel] ?? 0) + 1
    return acc
  }, {}) ?? {}

  const totalRevenue = revenueRes.data?.reduce((sum, o) => sum + (o.total ?? 0), 0) ?? 0

  res.json({
    orders_30d: ordersRes.count ?? 0,
    revenue_30d: +totalRevenue.toFixed(2),
    by_channel: byChannel,
  })
})

tenantRouter.get('/me/menu', async (req, res) => {
  const { tenantId } = req.user!
  const { data, error } = await supabase
    .from('menu_items')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('category, name')
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

tenantRouter.post('/me/menu', async (req, res) => {
  const { tenantId, role } = req.user!
  if (role !== 'admin') return res.status(403).json({ error: 'Admin only' })

  const item = { ...req.body, tenant_id: tenantId }
  const { data, error } = await supabase.from('menu_items').insert(item).select().single()
  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})
