import { McpServer } from '@modelcontextprotocol/sdk/server/mcp';

import cors from 'cors';
import express from 'express';
import { config } from './config/config';
import { oauthProtectedResourceHandler } from './lib/auth';
import { logger } from './lib/logger';
import { authMiddleware } from './lib/middleware';
import { setupTransportRoutes } from './lib/transport';
import { registerTools } from './tools/index';

const PORT = config.port;
const server = new McpServer({ name: config.serverName, version: config.serverVersion });

const app = express();

const allowAll = cors({
  origin: (origin, cb) => cb(null, true),
  credentials: false,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Mcp-Protocol-Version', 'Content-Type', 'Authorization'],
  exposedHeaders: ['WWW-Authenticate'],
  maxAge: 86400,
});

app.options(/.*/, allowAll);
app.use(allowAll);

app.use(express.json());
app.use(authMiddleware);

app.get('/.well-known/oauth-protected-resource', oauthProtectedResourceHandler);

setupTransportRoutes(app, server);
logger.info('Transport routes set up successfully');

registerTools(server);
logger.info('Registered tools successfully');

app.listen(PORT, () => logger.info(`MCP server running on ${config.baseUrl} (port ${PORT})`));