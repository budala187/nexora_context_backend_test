import { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp';
import { z } from 'zod';
import { logger } from '../lib/logger';
import { TOOLS } from './index';
import { Orchestrator } from './internal/orchestrator';
import { Executor } from './internal/executor';
import { Refiner } from './internal/refiner';

// Initialize the three components
const orchestrator = new Orchestrator();
const executor = new Executor();
const refiner = new Refiner();

export function registerContextFinderTool(server: McpServer) {
  TOOLS.context_finder.registeredTool = server.tool(
    TOOLS.context_finder.name,
    TOOLS.context_finder.description,
    {
      query: z.string().min(1, 'Query is required'),
      context: z.record(z.any()).optional().describe('Optional context'),
    },
    async ({ query, context }) => {
      const startTime = Date.now();
      logger.info(`🤖 Context Finder received: "${query}"`);
      
      try {
        // Step 1: Orchestrator decides which tools to use
        logger.info('📋 Step 1: Planning...');
        const toolPlan = await orchestrator.selectTools(query, context);
        
        // Step 2: Executor runs the selected tools
        logger.info('🔧 Step 2: Executing...');
        const toolResults = await executor.executeTools(toolPlan);
        
        // Step 3: Refiner combines and cleans results
        logger.info('✨ Step 3: Refining...');
        const refinedAnswer = await refiner.refineResults(query, toolResults);
        
        const executionTime = Date.now() - startTime;
        logger.info(`✅ Completed in ${executionTime}ms`);
        
        return {
          content: [{
            type: 'text',
            text: refinedAnswer.content
          }],
        };
        
      } catch (error) {
        logger.error('Context finder failed:', error);
        
        // Properly handle the error type
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