import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { logger } from '../lib/logger.js';
import { TOOLS } from './index.js';
import { trackUsage, decrementUsage } from '../lib/usage.js';
import { DatabaseQueryTool } from './internal/internal-tools/database-query.js';
import { ToolConfig } from './internal/base-tool.js'; // Import the actual ToolConfig type

export function registerContextFinderTool(server: McpServer) {
  const databaseTool = new DatabaseQueryTool();
  
  TOOLS.context_finder.registeredTool = server.tool(
    TOOLS.context_finder.name,
    TOOLS.context_finder.description,
    {
      query: z.string().min(1, 'Query is required'),
      context: z.record(z.any()).optional().describe('Optional context'),
    },
    async (params) => {
      const startTime = Date.now();
      const { query, context } = params;
      
      logger.info(`🤖 Context Finder received: "${query}"`);
      
      try {
        // Extract user info from context if it exists
        const clerkUserId = context?._context?.clerkUserId || context?.clerkUserId;
        const usageStrategy = context?._context?.usageStrategy;
        
        if (!clerkUserId) {
          logger.error('No user ID found in context');
          return {
            content: [{
              type: 'text',
              text: 'Error: User authentication required. Please ensure you are properly authenticated.'
            }],
          };
        }
        
        logger.info(`Processing query for user: ${clerkUserId}`);
        
        // Create proper ToolConfig object with all required fields
        const config: ToolConfig = {
          clerkUserId,
          name: 'database_query', // Required field
          priority: 1,
          depth: 'medium',
          focus: [],
          reason: 'User query search',
          ...context // Spread any additional context
        };
        
        const result = await databaseTool.execute(query, config);
        
        const executionTime = Date.now() - startTime;
        
        if (!result.success) {
          logger.error('Database query failed:', result.error);
          return {
            content: [{
              type: 'text',
              text: `Error searching database: ${result.error || 'Unknown error'}`
            }],
          };
        }
        
        // Format results
        let responseText = '';
        
        if (result.data?.results && result.data.results.length > 0) {
          responseText = `Found ${result.data.totalResults} results across ${Object.keys(result.data.sources || {}).length} sources:\n\n`;
          
          // Group results by source
          const groupedResults: Record<string, any[]> = {};
          for (const item of result.data.results) {
            if (!groupedResults[item.source]) {
              groupedResults[item.source] = [];
            }
            groupedResults[item.source].push(item);
          }
          
          // Format by source
          for (const [source, items] of Object.entries(groupedResults)) {
            responseText += `\n**From ${source}:**\n`;
            items.slice(0, 5).forEach((item, idx) => {
              responseText += `${idx + 1}. ${item.content.substring(0, 200)}${item.content.length > 200 ? '...' : ''}\n`;
              if (item.score) {
                responseText += `   Score: ${item.score.toFixed(3)}\n`;
              }
            });
          }
          
          if (result.data.queryVariations && result.data.queryVariations.length > 1) {
            responseText += `\n\nSearched variations: ${result.data.queryVariations.join(', ')}`;
          }
        } else {
          responseText = 'No results found in your database for this query.';
        }
        
        // Track usage with actual token counts if available
        const tokenUsage = result.data?.tokenUsage || {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0
        };
        
        try {
          await trackUsage(clerkUserId, 'context_finder', {
            inputTokens: tokenUsage.prompt_tokens,
            outputTokens: tokenUsage.completion_tokens,
            totalTokens: tokenUsage.total_tokens,
            cost: (tokenUsage.prompt_tokens * 0.00003 + tokenUsage.completion_tokens * 0.00006) / 1000, // GPT-4 pricing
            processingTime: executionTime,
            toolsUsed: ['database_query']
          });
          
          // Decrement usage
          await decrementUsage(clerkUserId, usageStrategy?.useHeroPoints || false);
        } catch (usageError) {
          logger.error('Usage tracking failed:', usageError);
          // Don't fail the request due to usage tracking error
        }
        
        logger.info(`✅ Completed in ${executionTime}ms`);
        
        return {
          content: [{
            type: 'text',
            text: responseText
          }],
        };
        
      } catch (error) {
        logger.error('Context finder failed:', error);
        
        const errorMessage = error instanceof Error 
          ? error.message 
          : String(error);
        
        return {
          content: [{
            type: 'text',
            text: `Error: ${errorMessage}`
          }],
        };
      }
    }
  );
}