import { createClient } from '@supabase/supabase-js';
import { logger } from './logger';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface UsageData {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost: number;
  processingTime: number;
  toolsUsed: string[];
}

export async function trackUsage(clerkUserId: string, endpoint: string, usage: UsageData): Promise<void> {
  try {
    const costCents = Math.round(usage.cost * 100);

    await supabase
      .from('requests')
      .insert({
        clerk_user_id: clerkUserId,
        endpoint,
        input_tokens: usage.inputTokens,
        output_tokens: usage.outputTokens,
        total_tokens: usage.totalTokens,
        cost_cents: costCents,
        tools_used: usage.toolsUsed,
        processing_time_ms: usage.processingTime,
        is_error: false
      });

    logger.info('Usage tracked', { clerkUserId, endpoint });

  } catch (error) {
    logger.error('Track usage error', error);
  }
}

export async function decrementUsage(clerkUserId: string, useHeroPoints: boolean = false): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .rpc('decrement_usage', {
        p_clerk_user_id: clerkUserId,
        p_use_hero_points: useHeroPoints
      });

    if (error || !data || data.length === 0) {
      logger.error('Decrement usage error', error);
      return false;
    }

    logger.info('Usage decremented', { clerkUserId, useHeroPoints });
    return true;

  } catch (error) {
    logger.error('Decrement usage error', error);
    return false;
  }
}