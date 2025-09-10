import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp';
import express from 'express';
import { logger } from './logger';

export const setupTransportRoutes = (
  app: express.Express,
  server: McpServer
) => {
  app.post('/', async (req, res) => {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless
    });
    
    // Inject user context into the request body
    const enrichedBody = {
      ...req.body,
      _context: {
        clerkUserId: req.user?.id,
        userEmail: req.user?.email,
        usageStrategy: req.usageStrategy
      }
    };
    
    await server.connect(transport);
    try {
      await transport.handleRequest(req, res, enrichedBody);
    } catch (error) {
      logger.error('Transport error:', error);
    }
  });
};