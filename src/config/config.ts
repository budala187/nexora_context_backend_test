import dotenv from 'dotenv';

dotenv.config();

export const config = {
  serverName: 'Greeting MCP',
  serverVersion: '1.0.0',
  port: Number(process.env.PORT), // Render will always provide this
  baseUrl: process.env.BASE_URL || '', // Must be set in environment variables
  logLevel: 'info',
  clerkIssuer: 'https://honest-cod-68.clerk.accounts.dev',
  clerkJwksUri: 'https://honest-cod-68.clerk.accounts.dev/.well-known/jwks.json',
  clerkAuthorizationEndpoint: 'https://honest-cod-68.clerk.accounts.dev/oauth/authorize',
  clerkTokenEndpoint: 'https://honest-cod-68.clerk.accounts.dev/oauth/token',
  clerkTokenIntrospectionEndpoint: 'https://honest-cod-68.clerk.accounts.dev/oauth/token_info',
  protectedResourceMetadata: process.env.PROTECTED_RESOURCE_METADATA || '',
  };