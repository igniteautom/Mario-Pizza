import { Router } from 'express'
import { supabase } from '../lib/supabase.js'

export const ordersRouter = Router()

ordersRouter.get('/', async (req, res) => {
  const { tenantId } = req.user!
  const { page = '1', limit = '50', status, channel } = req.query

  let query = supabase
    .from('orders')
    .select('*', { count: 'exact' })
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .range((+page - 1) * +limit, +page * +limit - 1)

  if (status) query = query.eq('status', status as string)
  if (channel) query = query.eq('channel', channel as string)

  const { data, error, count } = await query
  if (error) return res.status(500).json({ error: error.message })
  res.json({ orders: data, total: count, page: +page, limit: +limit })
})

ordersRouter.patch('/:orderId/status', async (req, res) => {
  const { tenantId } = req.user!
  const { orderId } = req.params
  const { status } = req.body

  const valid = ['confirmed', 'preparing', 'ready', 'delivered', 'cancelled']
  if (!valid.includes(status)) return res.status(400).json({ error: 'Invalid status' })

  const { data, error } = await supabase
    .from('orders')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', orderId)
    .eq('tenant_id', tenantId)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})
