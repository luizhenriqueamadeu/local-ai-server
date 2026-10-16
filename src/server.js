/**
 * Main Express Server
 * OpenAI-compatible API server with automatic model rotation
 */

import express from 'express';
import cors from 'cors';
import pino from 'pino';
import pinoPretty from 'pino-pretty';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { ChatCompletionHandler } from './core/ChatCompletionHandler.js';
import { providerFactory, ProviderFactory } from './providers/ProviderFactory.js';
import { ModelRotationManager } from './core/ModelRotationManager.js';
import { getAllModels } from './config/providers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  logLevel: process.env.LOG_LEVEL || 'info',
  requestTimeout: parseInt(process.env.REQUEST_TIMEOUT || '120000', 10),
  rotationStrategy: process.env.ROTATION_STRATEGY || 'rate-limit',
  preserveContext: process.env.PRESERVE_CONTEXT !== 'false',
  maxContextMessages: parseInt(process.env.MAX_CONTEXT_MESSAGES || '20', 10),
  rateLimitRetryDelay: parseInt(process.env.RATE_LIMIT_RETRY_DELAY || '5000', 10),
  maxRetries: parseInt(process.env.MAX_RETRIES || '3', 10),
};

// Logger
const logger = pino({
  level: config.logLevel,
  transport: {
    target: 'pino-pretty',
    options: { colorize: true, translateTime: 'HH:MM:ss Z', ignore: 'pid,hostname' },
  },
});

// Initialize provider factory
providerFactory.initialize({ timeout: config.requestTimeout });

// Initialize chat completion handler
const chatHandler = new ChatCompletionHandler({
  rotationStrategy: config.rotationStrategy,
  preserveContext: config.preserveContext,
  maxContextMessages: config.maxContextMessages,
  rateLimitRetryDelay: config.rateLimitRetryDelay,
  maxRetries: config.maxRetries,
  requestTimeout: config.requestTimeout,
  providerFactory,
});

// Create Express app
const app = express();

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Conversation-ID'],
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Request logging with body debug
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info({
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      body: req.method === 'POST' ? JSON.stringify(req.body).substring(0, 200) : undefined,
    }, 'Request completed');
  });
  next();
});

// Debug endpoint to test request body parsing
app.post('/debug/echo', (req, res) => {
  res.json({ 
    body: req.body,
    headers: req.headers,
    method: req.method,
    url: req.url
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    providers: providerFactory.getAvailableProviders(),
    currentModel: chatHandler.rotationManager.getCurrentModel(),
  });
});

// Provider health check
app.get('/health/providers', async (req, res) => {
  try {
    const health = await providerFactory.healthCheck();
    res.json({ providers: health, timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// List models (OpenAI-compatible)
app.get('/v1/models', async (req, res) => {
  try {
    const models = await chatHandler.listModels();
    res.json(models);
  } catch (error) {
    logger.error({ error: error.message }, 'Error listing models');
    res.status(500).json({ error: { message: error.message, type: 'server_error' } });
  }
});

// Chat completions (OpenAI-compatible)
app.post('/v1/chat/completions', async (req, res) => {
  try {
    const response = await chatHandler.handleChatCompletion(req.body, req.headers);

    // Handle streaming
    if (req.body.stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      const model = response.model || chatHandler.rotationManager.getCurrentModel();
      const provider = response.provider || 'unknown';

      try {
        for await (const chunk of chatHandler.handleStreaming(response, model, provider)) {
          if (res.writableEnded) break;
          res.write(chunk);
        }
        if (!res.writableEnded) res.end();
      } catch (streamError) {
        logger.error({ error: streamError.message }, 'Streaming error');
        if (!res.writableEnded) {
          res.write(`data: ${JSON.stringify({ error: { message: streamError.message } })}\n\n`);
          res.end();
        }
      }
    } else {
      if (!res.headersSent) {
        res.json(response);
      }
    }
  } catch (error) {
    logger.error({ error: error.message, stack: error.stack }, 'Chat completion error');

    const status = error.status || 500;
    const code = error.code || 'internal_error';

    if (!res.headersSent) {
      res.status(status).json({
        error: {
          message: error.message,
          type: code,
          code,
        },
      });
    }
  }
});

// Rotation status
app.get('/v1/rotation/status', (req, res) => {
  res.json(chatHandler.getRotationStatus());
});

// Manual model selection
app.post('/v1/rotation/model', (req, res) => {
  const { model } = req.body;
  if (!model) {
    return res.status(400).json({ error: { message: 'Model is required', type: 'invalid_request' } });
  }

  const success = chatHandler.setCurrentModel(model);
  if (success) {
    res.json({ success: true, currentModel: model });
  } else {
    res.status(404).json({ error: { message: `Model not found: ${model}`, type: 'not_found' } });
  }
});

// Reset model state
app.post('/v1/rotation/reset', (req, res) => {
  const { model } = req.body;
  if (model) {
    chatHandler.resetModelState(model);
    res.json({ success: true, message: `Reset state for ${model}` });
  } else {
    // Reset all
    for (const modelId of chatHandler.rotationManager.modelOrder) {
      chatHandler.resetModelState(modelId);
    }
    res.json({ success: true, message: 'Reset all model states' });
  }
});

// Get current model info
app.get('/v1/models/current', (req, res) => {
  const currentModel = chatHandler.rotationManager.getCurrentModel();
  const modelInfo = getAllModels()[currentModel];
  res.json({
    model: currentModel,
    info: modelInfo,
    status: chatHandler.rotationManager.getStatus()[currentModel],
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'Local AI Server',
    version: '1.0.0',
    description: 'OpenAI-compatible API server with automatic model rotation',
    endpoints: {
      chat: '/v1/chat/completions',
      models: '/v1/models',
      health: '/health',
      rotationStatus: '/v1/rotation/status',
      currentModel: '/v1/models/current',
    },
    documentation: 'https://github.com/your-repo/local-ai-server',
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: { message: 'Not found', type: 'not_found' } });
});

// Error handler
app.use((err, req, res, next) => {
  logger.error({ error: err.message, stack: err.stack }, 'Unhandled error');
  res.status(500).json({ error: { message: 'Internal server error', type: 'server_error' } });
});

// Start server
const server = app.listen(config.port, config.host, () => {
  logger.info(`🚀 Local AI Server running on http://${config.host}:${config.port}`);
  logger.info(`📡 OpenAI-compatible API: http://${config.host}:${config.port}/v1/chat/completions`);
  logger.info(`🔄 Model rotation: ${config.rotationStrategy}`);
  logger.info(`🧠 Context preservation: ${config.preserveContext ? 'enabled' : 'disabled'}`);
  logger.info(`📦 Providers: ${providerFactory.getAvailableProviders().join(', ')}`);
  logger.info(`🎯 Current model: ${chatHandler.rotationManager.getCurrentModel()}`);
});

// Graceful shutdown
const shutdown = async (signal) => {
  logger.info(`${signal} received, shutting down gracefully...`);
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });

  // Force close after 10 seconds
  setTimeout(() => {
    logger.error('Forced shutdown');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.fatal({ error: error.message, stack: error.stack }, 'Uncaught exception');
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.fatal({ reason }, 'Unhandled rejection');
  process.exit(1);
});

export { app, chatHandler, providerFactory };