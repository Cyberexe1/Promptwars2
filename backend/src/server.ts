import { createApp } from './app.js';
import { config } from './config.js';
import { isBedrockEnabled } from './services/bedrock.js';
import { logger } from './utils/logger.js';

const app = createApp();

const server = app.listen(config.port, () => {
  logger.info('server_started', {
    port: config.port,
    env: config.nodeEnv,
    bedrock: isBedrockEnabled() ? 'enabled' : 'disabled (rules only)',
  });
});

function shutdown(signal: string): void {
  logger.info('server_stopping', { signal });
  server.close(() => process.exit(0));
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
