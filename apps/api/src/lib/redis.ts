import { Redis } from '@upstash/redis'

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

interface ConversationMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

export async function getConversationHistory(tenantId: string, sessionId: string) {
  const key = `conv:${tenantId}:${sessionId}`
  return (await redis.get<ConversationMessage[]>(key)) ?? []
}

export async function appendToHistory(
  tenantId: string,
  sessionId: string,
  message: ConversationMessage,
  ttlSeconds = 1800
) {
  const key = `conv:${tenantId}:${sessionId}`
  const history = await getConversationHistory(tenantId, sessionId)
  history.push(message)
  if (history.length > 20) history.splice(0, history.length - 20)
  await redis.set(key, history, { ex: ttlSeconds })
}

export async function clearConversation(tenantId: string, sessionId: string) {
  await redis.del(`conv:${tenantId}:${sessionId}`)
}
