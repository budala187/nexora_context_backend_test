import OpenAI from 'openai';
import { getToolRegistry } from './tool-registry';
import { logger } from '../../lib/logger';

// Model configuration
const OPENAI_MODEL_ORCHESTRATOR = process.env.OPENAI_MODEL_ORCHESTRATOR!;

export interface Tool {
  name: string;
  params: any;
  priority: number;
  reason: string;
}

export interface ToolPlan {
  tools: Tool[];
  strategy: 'parallel' | 'sequential';
}

export class Orchestrator {
  private openai: OpenAI;
  
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }
  
  async selectTools(query: string, context?: any): Promise<ToolPlan> {
    const toolRegistry = getToolRegistry();
    const availableTools = toolRegistry.getToolDescriptions();
    
    const prompt = `You are a tool selector. Select the best tools to answer the query.

AVAILABLE TOOLS:
${availableTools}

USER QUERY: "${query}"
${context ? `CONTEXT: ${JSON.stringify(context)}` : ''}

Select tools and create an execution plan. Return ONLY valid JSON:
{
  "tools": [
    {
      "name": "tool_name",
      "params": { 
        "query": "the query for this tool",
        "any_other": "parameters needed"
      },
      "priority": 1,
      "reason": "why this tool"
    }
  ],
  "strategy": "parallel" or "sequential"
}`;

    const response = await this.openai.chat.completions.create({
      model: OPENAI_MODEL_ORCHESTRATOR,
      messages: [{ role: 'system', content: prompt }],
      temperature: 0.2,
      response_format: { type: 'json_object' }
    });
    
    const plan = JSON.parse(response.choices[0]?.message?.content || '{}');
    logger.info(`📋 Selected ${plan.tools?.length || 0} tools: ${plan.tools?.map((t: Tool) => t.name).join(', ')}`);
    
    return plan as ToolPlan;
  }
}