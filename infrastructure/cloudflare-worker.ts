/**
 * Ignite Automations — Cloudflare Worker
 * Handles edge routing, rate limiting, and tenant resolution
 * Deploy: wrangler deploy
 */

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const origin = env.API_ORIGIN // e.g. https://ignite-api.railway.app

    // Health check at edge
    if (url.pathname === '/edge-health') {
      return new Response(JSON.stringify({ ok: true, region: request.cf?.colo }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Rate limiting via KV
    if (url.pathname.startsWith('/webhooks/')) {
      const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown'
      const key = `rl:${ip}:${Math.floor(Date.now() / 60000)}`
      const count = parseInt((await env.RATE_LIMIT_KV.get(key)) ?? '0')

      if (count > 60) {
        return new Response('Too Many Requests', { status: 429 })
      }

      await env.RATE_LIMIT_KV.put(key, String(count + 1), { expirationTtl: 120 })
    }

    // Add CORS headers for dashboard
    const corsHeaders = {
      'Access-Control-Allow-Origin': env.DASHBOARD_ORIGIN ?? '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders })
    }

    // Proxy to Railway API
    const proxyUrl = `${origin}${url.pathname}${url.search}`
    const proxiedRequest = new Request(proxyUrl, {
      method: request.method,
      headers: request.headers,
      body: request.body,
    })

    const response = await fetch(proxiedRequest)
    const newResponse = new Response(response.body, response)
    Object.entries(corsHeaders).forEach(([k, v]) => newResponse.headers.set(k, v))

    return newResponse
  },
}

interface Env {
  API_ORIGIN: string
  DASHBOARD_ORIGIN: string
  RATE_LIMIT_KV: KVNamespace
}
