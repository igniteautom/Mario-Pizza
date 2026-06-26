import Anthropic from '@anthropic-ai/sdk'
import { supabase } from './supabase.js'
import { getConversationHistory, appendToHistory } from './redis.js'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export interface OrderData {
  items: string
  total: number
  customerName: string
}

export async function processOrderMessage(params: {
  tenantId: string
  sessionId: string
  userMessage: string
  channel: 'voice' | 'sms' | 'telegram' | 'whatsapp' | 'web'
}): Promise<{ reply: string; orderData: OrderData | null }> {
  const { tenantId, sessionId, userMessage, channel } = params

  const [tenant, history, menuItems] = await Promise.all([
    getTenantConfig(tenantId),
    getConversationHistory(tenantId, sessionId),
    getMenuItems(tenantId),
  ])

  if (!tenant) throw new Error(`Tenant ${tenantId} not found`)

  const menuText = menuItems
    .map(i => `- ${i.name}: $${i.price.toFixed(2)}${i.description ? ` (${i.description})` : ''}`)
    .join('\n')

  const isVoice = channel === 'voice'
  const systemPrompt = `Eres ${tenant.ai_persona_name}, el asistente de pedidos de ${tenant.business_name}.
${isVoice
    ? 'Responde de forma muy concisa (máximo 2 oraciones) ya que esto se convertirá a voz.'
    : 'Responde de forma amigable y clara por escrito.'
  }

MENÚ DISPONIBLE:
${menuText}

REGLAS IMPORTANTES:
- Ayuda al cliente a hacer su pedido paso a paso
- Si el cliente pide algo que no está en el menú, avísale amablemente y ofrece alternativas
- Cuando el pedido esté confirmado por el cliente, incluye EXACTAMENTE esta línea:
  PEDIDO_CONFIRMADO: [descripción items] | TOTAL: $[monto numérico] | CLIENTE: [nombre cliente]
- Solo incluye PEDIDO_CONFIRMADO cuando el cliente haya confirmado explícitamente`

  await appendToHistory(tenantId, sessionId, {
    role: 'user',
    content: userMessage,
    timestamp: Date.now(),
  })

  const messages: Anthropic.MessageParam[] = [
    ...history.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user', content: userMessage },
  ]

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 400,
    system: systemPrompt,
    messages,
  })

  const aiText = response.content[0].type === 'text' ? response.content[0].text : ''

  await appendToHistory(tenantId, sessionId, {
    role: 'assistant',
    content: aiText,
    timestamp: Date.now(),
  })

  const orderData = extractOrderData(aiText)
  return { reply: aiText, orderData }
}

function extractOrderData(text: string): OrderData | null {
  const match = text.match(
    /PEDIDO_CONFIRMADO:\s*(.+?)\s*\|\s*TOTAL:\s*\$?([\d.]+)\s*\|\s*CLIENTE:\s*(.+)/i
  )
  if (!match) return null
  return {
    items: match[1].trim(),
    total: parseFloat(match[2]),
    customerName: match[3].trim(),
  }
}

async function getTenantConfig(tenantId: string) {
  const { data } = await supabase
    .from('tenants')
    .select('business_name, ai_persona_name, plan')
    .eq('id', tenantId)
    .single()
  return data
}

async function getMenuItems(tenantId: string) {
  const { data } = await supabase
    .from('menu_items')
    .select('name, price, description')
    .eq('tenant_id', tenantId)
    .eq('active', true)
    .order('category, name')
  return (data ?? []) as { name: string; price: number; description: string }[]
}
