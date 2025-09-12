import dotenv from 'dotenv';

dotenv.config();

export const config = {
  serverName: 'Greeting MCP',
  serverVersion: '1.0.0',
  port: Number(process.env.PORT), // Render will always provide this
  baseUrl: process.env.BASE_URL || '', // Must be set in environment variables
  skEnvUrl: process.env.SCALEKIT_ENVIRONMENT_URL,
  skClientId: process.env.SCALEKIT_CLIENT_ID,
  skClientSecret: process.env.SCALEKIT_CLIENT_SECRET,
  logLevel: 'info',
  mcpServerId: process.env.MCP_SERVER_ID || '',
  protectedResourceMetadata: process.env.PROTECTED_RESOURCE_METADATA || '',
};