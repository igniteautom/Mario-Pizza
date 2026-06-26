import { Router } from 'express'
import { processOrderMessage } from '../lib/ai.js'
import { supabase } from '../lib/supabase.js'
import { sendSMS, sendTelegramMessage } from '../lib/vonage.js'

export const webhookRouter = Router()

async function saveOrder(params: {
  tenantId: string
  channel: string
  phone: string
  items: string
  total: number
  customerName: string
}) {
  const { error } = await supabase.from('orders').insert({
    tenant_id: params.tenantId,
    channel: params.channel,
    customer_phone: params.phone,
    customer_name: params.customerName,
    items_description: params.items,
    total: params.total,
    status: 'confirmed',
  })
  if (error) console.error('Failed to save order:', error.message)
}

webhookRouter.post('/vonage/sms/:tenantId', async (req, res) => {
  res.sendStatus(200)
  const { tenantId } = req.params
  try {
    const body = req.body
    const fromNumber: string = body?.from?.number ?? body?.msisdn ?? 'unknown'
    const messageText: string = body?.message?.content?.text ?? body?.text ?? ''
    if (!messageText) return

    const { reply, orderData } = await processOrderMessage({
      tenantId,
      sessionId: fromNumber,
      userMessage: messageText,
      channel: 'sms',
    })

    await sendSMS({ to: fromNumber, text: reply, tenantId })

    if (orderData) {
      await saveOrder({ tenantId, channel: 'sms', phone: fromNumber, ...orderData })
    }
  } catch (err) {
    console.error('SMS webhook error:', err)
  }
})

webhookRouter.post('/vonage/voice/:tenantId', async (req, res) => {
  const { tenantId } = req.params
  const { from, uuid } = req.body
  const spokenText: string = req.body?.speech?.results?.[0]?.text ?? 'Hola, quiero hacer un pedido'

  try {
    const { reply } = await processOrderMessage({
      tenantId,
      sessionId: uuid ?? from,
      userMessage: spokenText,
      channel: 'voice',
    })

    res.json([
      {
        action: 'talk',
        text: reply,
        language: 'es-MX',
        style: 1,
      },
      {
        action: 'input',
        type: ['speech'],
        speech: { language: 'es-MX', endOnSilence: 2, maxDuration: 10 },
        eventUrl: [`${process.env.BASE_URL}/webhooks/vonage/voice/${tenantId}`],
      },
    ])
  } catch (err) {
    console.error('Voice webhook error:', err)
    res.json([
      { action: 'talk', text: 'Lo siento, ocurrió un error. Por favor llame más tarde.', language: 'es-MX' },
    ])
  }
})

webhookRouter.post('/vonage/voice/:tenantId/answer', async (req, res) => {
  const { tenantId } = req.params
  const { from } = req.body

  const { reply } = await processOrderMessage({
    tenantId,
    sessionId: from,
    userMessage: 'Hola, quiero hacer un pedido',
    channel: 'voice',
  })

  res.json([
    { action: 'talk', text: reply, language: 'es-MX', style: 1 },
    {
      action: 'input',
      type: ['speech'],
      speech: { language: 'es-MX', endOnSilence: 2 },
      eventUrl: [`${process.env.BASE_URL}/webhooks/vonage/voice/${tenantId}`],
    },
  ])
})

webhookRouter.post('/telegram/:tenantId', async (req, res) => {
  res.sendStatus(200)
  const { tenantId } = req.params
  const message = req.body?.message
  if (!message?.text) return

  const chatId = message.chat.id.toString()
  try {
    const { reply, orderData } = await processOrderMessage({
      tenantId,
      sessionId: chatId,
      userMessage: message.text,
      channel: 'telegram',
    })

    await sendTelegramMessage(chatId, reply, tenantId)

    if (orderData) {
      await saveOrder({ tenantId, channel: 'telegram', phone: chatId, ...orderData })
    }
  } catch (err) {
    console.error('Telegram webhook error:', err)
  }
})

webhookRouter.post('/web/:tenantId', async (req, res) => {
  const { tenantId } = req.params
  const { message, sessionId } = req.body
  if (!message || !sessionId) return res.status(400).json({ error: 'Missing message or sessionId' })

  try {
    const { reply, orderData } = await processOrderMessage({
      tenantId,
      sessionId,
      userMessage: message,
      channel: 'web',
    })

    if (orderData) {
      await saveOrder({ tenantId, channel: 'web', phone: sessionId, ...orderData })
    }

    res.json({ reply, orderConfirmed: !!orderData, orderData })
  } catch (err) {
    console.error('Web webhook error:', err)
    res.status(500).json({ error: 'Internal error' })
  }
})
