import { NextFunction, Request, Response } from 'express';
import { config } from '../config/config';
import { logger } from './logger';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Extend Request type
declare global {
  namespace Express {
    interface Request {
      user?: { 
        id: string; 
        email?: string;
      };
      usageStrategy?: {
        useHeroPoints: boolean;
        clerkUserId: string;
      };
    }
  }
}

export const WWWHeader = {
  HeaderKey: 'WWW-Authenticate',
  HeaderValue: `Bearer realm="OAuth", resource_metadata="${config.baseUrl}/.well-known/oauth-protected-resource"`
};

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    // Allow public access to well-known endpoints
    if (req.path.includes('.well-known')) {
      return next();
    }

    // Extract token
    const authHeader = req.headers['authorization'];
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.split('Bearer ')[1]?.trim()
      : null;

    if (!token) {
      logger.warn('Missing Bearer token', { path: req.path });
      return res.status(401)
        .set(WWWHeader.HeaderKey, WWWHeader.HeaderValue)
        .json({ error: 'Unauthorized' });
    }

    // Validate token with Clerk's userinfo endpoint
    try {
      const response = await fetch('https://honest-cod-68.clerk.accounts.dev/oauth/userinfo', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Invalid token');
      }

      const userInfo = await response.json();
      const clerkUserId = userInfo.sub || userInfo.user_id;

      // Set user on request
      req.user = {
        id: clerkUserId,
        email: userInfo.email
      };

      logger.info('Authentication successful', { userId: clerkUserId });

      // Check usage limits
      const { data: userLimits, error } = await supabase
        .rpc('get_user_limits', { p_clerk_user_id: clerkUserId });

      if (error || !userLimits || userLimits.length === 0) {
        return res.status(403).json({
          error: 'User not found. Please complete registration first.',
          code: 'USER_NOT_REGISTERED'
        });
      }

      const user = userLimits[0];
      
      logger.info('User limits', {
        clerkUserId,
        daily_limit: user.daily_limit,
        available_today: user.available_today,
        available_month: user.available_month,
        hero_points: user.hero_points
      });

      // Check limits
      const canUseDaily = user.available_today > 0;
      const canUseMonthly = user.available_month > 0;
      const hasHeroPoints = user.hero_points > 0;

      if (!canUseDaily && canUseMonthly) {
        return res.status(429).json({
          error: 'Daily limit reached, try tomorrow',
          limits: {
            daily: { limit: user.daily_limit, remaining: user.available_today },
            monthly: { limit: user.monthly_limit, remaining: user.available_month }
          }
        });
      }

      if (!canUseMonthly && !hasHeroPoints) {
        return res.status(429).json({
          error: 'Monthly limit reached, buy HERO credits',
          limits: {
            daily: { limit: user.daily_limit, remaining: user.available_today },
            monthly: { limit: user.monthly_limit, remaining: user.available_month },
            heroPoints: user.hero_points
          }
        });
      }

      // Store usage strategy
      req.usageStrategy = {
        useHeroPoints: !canUseMonthly && hasHeroPoints,
        clerkUserId
      };

      next();
    } catch (error) {
      logger.error('Token validation failed:', error);
      return res.status(401)
        .set(WWWHeader.HeaderKey, WWWHeader.HeaderValue)
        .json({ error: 'Unauthorized' });
    }
  } catch (err) {
    logger.warn('Unauthorized request', {
      error: err instanceof Error ? err.message : String(err)
    });
    
    return res.status(401)
      .set(WWWHeader.HeaderKey, WWWHeader.HeaderValue)
      .json({ error: 'Unauthorized' });
  }
}