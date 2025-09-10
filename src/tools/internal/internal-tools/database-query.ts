import { BaseTool, ToolConfig, ToolResponse } from '../base-tool';
import { logger } from '../../../lib/logger';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import weaviate, { WeaviateClient, ApiKey } from 'weaviate-ts-client';

// Configuration variables you asked for
const WEAVIATE_CLASS_NAME = process.env.WEAVIATE_CLASS_NAME!;
const OPENAI_MODEL_REPHRASE = process.env.OPENAI_MODEL_REPHRASE!;

interface SearchResult {
  source: 'keyword' | 'knowledge_graph' | 'vector';
  content: string;
  metadata?: any;
  score?: number;
}

export class DatabaseQueryTool extends BaseTool {
  name = 'database_query';
  description = 'Query all user-uploaded data from structured database, knowledge graph, and vector database';
  good_for = [
    'user uploaded data',
    'private information',
    'documents analysis',
    'finding specific content',
    'contextual search',
    'data not available elsewhere'
  ];
  
  private openai: OpenAI;
  private supabase: any;
  private weaviateClient: WeaviateClient;
  
  constructor() {
    super();
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    
    this.supabase = createClient(
      process.env.SUPABASE_URL || '',
      process.env.SUPABASE_ANON_KEY || ''
    );
    
    this.weaviateClient = weaviate.client({
      scheme: 'https',
      host: process.env.WEAVIATE_HOST || '',
      apiKey: new ApiKey(process.env.WEAVIATE_API_KEY || ''),
    });
  }
  
  async execute(query: string, config: ToolConfig): Promise<ToolResponse> {
    try {
      logger.info(`💾 Database query: ${query}`);
      
      const clerkUserId = config.clerkUserId;
      
      if (!clerkUserId) {
        throw new Error('clerk_user_id is required for database queries');
      }
      
      // Step 1: Rephrase query for better coverage
      const rephrased = await this.rephraseQuery(query);
      const allQueries = [query, ...rephrased];
      logger.info(`📝 Generated ${allQueries.length} query variations`);
      
      // Step 2: Execute all three search types in parallel
      const [keywordResults, knowledgeGraphResults, vectorResults] = await Promise.all([
        this.keywordSearch(query, clerkUserId),
        this.knowledgeGraphSearch(query, clerkUserId),
        this.vectorSearch(allQueries, clerkUserId)
      ]);
      
      // Step 3: Get additional vector searches for knowledge graph entities
      const entityVectorResults = await this.searchEntitiesInVector(
        knowledgeGraphResults.entities || [],
        clerkUserId
      );
      
      // Step 4: Combine all results
      const allResults: SearchResult[] = [
        ...keywordResults,
        ...knowledgeGraphResults.results,
        ...vectorResults,
        ...entityVectorResults
      ];
      
      logger.info(`📊 Total results: ${allResults.length} from all sources`);
      
      return {
        success: true,
        data: {
          results: allResults,
          queryVariations: allQueries,
          totalResults: allResults.length,
          sources: {
            keyword: keywordResults.length,
            knowledgeGraph: knowledgeGraphResults.results.length,
            vector: vectorResults.length + entityVectorResults.length
          }
        }
      };
      
    } catch (error) {
      logger.error('Database query failed:', error);
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
  
  private async rephraseQuery(query: string): Promise<string[]> {
    const prompt = `Rephrase this query in 2 different ways to capture different aspects and synonyms.
Original query: "${query}"

Return ONLY a JSON array with 2 rephrased versions:
["rephrased version 1", "rephrased version 2"]`;
    
    try {
      const response = await this.openai.chat.completions.create({
        model: OPENAI_MODEL_REPHRASE,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 200
      });
      
      const content = response.choices[0]?.message?.content || '[]';
      return JSON.parse(content);
    } catch (error) {
      logger.warn('Failed to rephrase query, using original only');
      return [];
    }
  }
  
  private async keywordSearch(query: string, clerkUserId: string): Promise<SearchResult[]> {
    try {
      logger.info(`🔍 Keyword search in Supabase: ${query}`);
      
      const { data, error } = await this.supabase
        .rpc('keyword_search_with_context', {
          search_query: query,
          user_id: clerkUserId,
          context_words: 50
        });
      
      if (error) {
        logger.error('Supabase error:', error);
        return [];
      }
      
      return (data || []).map((item: any) => ({
        source: 'keyword' as const,
        content: item.context_text || '',
        metadata: {
          data_id: item.data_id,
          match_position: item.match_position,
          total_matches: item.total_matches
        }
      }));
      
    } catch (error) {
      logger.error('Keyword search failed:', error);
      return [];
    }
  }
  
  private async knowledgeGraphSearch(query: string, clerkUserId: string): Promise<{
    results: SearchResult[];
    entities: string[];
  }> {
    try {
      logger.info(`🕸️ Knowledge graph search: ${query}`);
      
      const { data: entityData, error: entityError } = await this.supabase
        .rpc('search_knowledge_entities', {
          search_query: query,
          user_id: clerkUserId,
          search_in: 'all'
        });
      
      if (entityError) {
        logger.error('Entity search error:', entityError);
        return { results: [], entities: [] };
      }
      
      const entities: string[] = [];
      const results: SearchResult[] = [];
      
      for (const entity of entityData || []) {
        entities.push(entity.entity_name);
        
        results.push({
          source: 'knowledge_graph' as const,
          content: `Entity: ${entity.entity_name} (${entity.entity_type}): ${entity.entity_description || 'No description'}`,
          score: entity.relevance_score,
          metadata: {
            entity_name: entity.entity_name,
            entity_type: entity.entity_type,
            data_id: entity.data_id
          }
        });
        
        const { data: relatedData, error: relatedError } = await this.supabase
          .rpc('get_related_entities', {
            search_entity_name: entity.entity_name,
            user_id: clerkUserId
          });
        
        if (!relatedError && relatedData) {
          for (const related of relatedData) {
            entities.push(related.entity_name);
            results.push({
              source: 'knowledge_graph' as const,
              content: `Related Entity: ${related.entity_name} (${related.entity_type})`,
              metadata: {
                entity_name: related.entity_name,
                entity_type: related.entity_type,
                relationship_type: related.relationship_type,
                data_id: related.data_id
              }
            });
          }
        }
      }
      
      return {
        results,
        entities: [...new Set(entities)]
      };
      
    } catch (error) {
      logger.error('Knowledge graph search failed:', error);
      return { results: [], entities: [] };
    }
  }
  
  private async vectorSearch(queries: string[], clerkUserId: string): Promise<SearchResult[]> {
    try {
      logger.info(`🎯 Vector search with ${queries.length} queries`);
      
      const allResults: SearchResult[] = [];
      
      for (const q of queries) {
        try {
          const result = await this.weaviateClient
            .graphql
            .get()
            .withClassName(WEAVIATE_CLASS_NAME)
            .withNearText({ concepts: [q] })
            .withWhere({
              path: ['clerkUserId'],
              operator: 'Equal',
              valueString: clerkUserId
            })
            .withLimit(5)
            .withFields('content _additional { certainty distance }')
            .do();
          
          if (result.data?.Get?.[WEAVIATE_CLASS_NAME]) {
            for (const doc of result.data.Get[WEAVIATE_CLASS_NAME]) {
              allResults.push({
                source: 'vector' as const,
                content: doc.content || '',
                score: doc._additional?.certainty || 0,
                metadata: { 
                  query: q,
                  distance: doc._additional?.distance
                }
              });
            }
          }
        } catch (queryError) {
          logger.error(`Vector search failed for query "${q}":`, queryError);
        }
      }
      
      return allResults;
      
    } catch (error) {
      logger.error('Vector search failed:', error);
      return [];
    }
  }
  
  private async searchEntitiesInVector(entities: string[], clerkUserId: string): Promise<SearchResult[]> {
    if (entities.length === 0) return [];
    
    try {
      logger.info(`🔎 Searching ${entities.length} entities in vector DB`);
      
      const results: SearchResult[] = [];
      
      for (const entity of entities) {
        try {
          const result = await this.weaviateClient
            .graphql
            .get()
            .withClassName(WEAVIATE_CLASS_NAME)
            .withNearText({ concepts: [entity] })
            .withWhere({
              path: ['clerkUserId'],
              operator: 'Equal',
              valueString: clerkUserId
            })
            .withLimit(3)
            .withFields('content _additional { certainty distance }')
            .do();
          
          if (result.data?.Get?.[WEAVIATE_CLASS_NAME]) {
            for (const doc of result.data.Get[WEAVIATE_CLASS_NAME]) {
              results.push({
                source: 'vector' as const,
                content: doc.content || '',
                score: doc._additional?.certainty || 0,
                metadata: { 
                  entity: entity,
                  fromKnowledgeGraph: true,
                  distance: doc._additional?.distance
                }
              });
            }
          }
        } catch (entityError) {
          logger.error(`Entity vector search failed for "${entity}":`, entityError);
        }
      }
      
      return results;
      
    } catch (error) {
      logger.error('Entity vector search failed:', error);
      return [];
    }
  }
}

export default DatabaseQueryTool;