import dotenv from 'dotenv';

dotenv.config();

export const config = {
  serverName: 'Greeting MCP',
  serverVersion: '1.0.0',
  port: Number(process.env.PORT), // Render will always provide this
  baseUrl: process.env.BASE_URL || '', // Must be set in environment variables
  skEnvUrl: process.env.SK_ENV_URL || '',
  skClientId: process.env.SK_CLIENT_ID || '',
  skClientSecret: process.env.SK_CLIENT_SECRET || '',
  logLevel: 'info',
  mcpServerId: process.env.MCP_SERVER_ID || '',
  clerkIssuer: 'https://honest-cod-68.clerk.accounts.dev',
  clerkJwksUri: 'https://honest-cod-68.clerk.accounts.dev/.well-known/jwks.json',
  clerkAuthorizationEndpoint: 'https://honest-cod-68.clerk.accounts.dev/oauth/authorize',
  clerkTokenEndpoint: 'https://honest-cod-68.clerk.accounts.dev/oauth/token',
  clerkTokenIntrospectionEndpoint: 'https://honest-cod-68.clerk.accounts.dev/oauth/token_info',
  
  // Update the protected resource metadata
  protectedResourceMetadata: JSON.stringify({
    authorization_servers: ['https://honest-cod-68.clerk.accounts.dev/oauth/authorize'],
    token_endpoint: 'https://honest-cod-68.clerk.accounts.dev/oauth/token',
    token_introspection_endpoint: 'https://honest-cod-68.clerk.accounts.dev/oauth/token_info',
    bearer_methods_supported: ['header'],
    resource: process.env.BASE_URL || 'https://23c2f47750f9.ngrok-free.app/',
    scopes_supported: ['openid', 'profile', 'email']
  })
};