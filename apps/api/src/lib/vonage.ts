import { supabase } from './supabase.js'

interface TenantVonageConfig {
  vonage_api_key: string
  vonage_api_secret: string
  vonage_number: string
}

export async function sendSMS(params: { to: string; text: string; tenantId: string }) {
  const { data: tenant } = await supabase
    .from('tenants')
    .select('vonage_api_key, vonage_api_secret, vonage_number')
    .eq('id', params.tenantId)
    .single<TenantVonageConfig>()

  if (!tenant?.vonage_api_key) {
    console.error('No Vonage credentials for tenant', params.tenantId)
    return
  }

  const res = await fetch('https://rest.nexmo.com/sms/json', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: tenant.vonage_api_key,
      api_secret: tenant.vonage_api_secret,
      from: tenant.vonage_number,
      to: params.to,
      text: params.text,
    }),
  })

  if (!res.ok) {
    console.error('Vonage SMS error', await res.text())
  }
}

export async function sendTelegramMessage(chatId: string, text: string, tenantId: string) {
  const { data: tenant } = await supabase
    .from('tenants')
    .select('telegram_bot_token')
    .eq('id', tenantId)
    .single()

  if (!tenant?.telegram_bot_token) return

  const res = await fetch(
    `https://api.telegram.org/bot${tenant.telegram_bot_token}/sendMessage`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    }
  )

  if (!res.ok) console.error('Telegram send error', await res.text())
}
