import { Request, Response, NextFunction } from 'express'
import { supabase } from '../lib/supabase.js'

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; tenantId: string; role: string }
    }
  }
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Unauthorized' })

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token)
    if (error || !user) return res.status(401).json({ error: 'Invalid token' })

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('tenant_id, role')
      .eq('user_id', user.id)
      .single()

    if (!profile) return res.status(403).json({ error: 'No profile found' })

    req.user = { id: user.id, tenantId: profile.tenant_id, role: profile.role }
    next()
  } catch {
    res.status(401).json({ error: 'Auth failed' })
  }
}
