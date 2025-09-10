import OpenAI from 'openai';
import { ToolResult } from './executor';
import { logger } from '../../lib/logger';

// Model configuration
const OPENAI_MODEL_REFINER = process.env.OPENAI_MODEL_REFINER!;

export interface RefinedResponse {
  content: string;
  confidence: number;
}

export class Refiner {
  private openai: OpenAI;
  
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }
  
  async refineResults(query: string, results: ToolResult[]): Promise<RefinedResponse> {
    const successful = results.filter(r => r.success);
    
    if (successful.length === 0) {
      logger.warn('No successful tool executions');
      return {
        content: "I couldn't find the information needed to answer your query. Please try rephrasing.",
        confidence: 0
      };
    }
    
    const prompt = `Create a comprehensive answer based on tool results.

ORIGINAL QUERY: "${query}"

TOOL RESULTS:
${successful.map(r => `
Tool: ${r.tool}
Data: ${JSON.stringify(r.data, null, 2)}
`).join('\n---\n')}

Instructions:
1. Answer the query directly
2. Combine all information coherently
3. Remove duplicates
4. Be conversational and helpful
5. Do NOT mention the tools used

Provide the answer:`;

    const response = await this.openai.chat.completions.create({
      model: OPENAI_MODEL_REFINER,
      messages: [{ role: 'system', content: prompt }],
      temperature: 0.3,
      max_tokens: 2000
    });
    
    const content = response.choices[0]?.message?.content || 'Unable to generate response';
    const confidence = this.calculateConfidence(results);
    
    logger.info(`✨ Refined response with ${confidence}% confidence`);
    
    return {
      content,
      confidence
    };
  }
  
  private calculateConfidence(results: ToolResult[]): number {
    const successful = results.filter(r => r.success).length;
    const total = results.length;
    
    if (total === 0) return 0;
    const successRate = (successful / total) * 100;
    
    if (successful >= 3) return Math.min(95, successRate);
    if (successful === 2) return Math.min(85, successRate);
    if (successful === 1) return Math.min(70, successRate);
    
    return successRate;
  }
}