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
import { existsSync, writeFileSync, mkdirSync } from 'fs';
import { ChatCompletionHandler } from './core/ChatCompletionHandler.js';
import { providerFactory, ProviderFactory } from './providers/ProviderFactory.js';
import { ModelRotationManager } from './core/ModelRotationManager.js';
import { getAllModels, rebuildProviders } from './config/providers.js';
import { FREE_PROVIDER_TEMPLATES } from './config/freeProviders.js';
import { updateEnvFile, maskSecret } from './config/envManager.js';
import { getUsers, addUser, updateUser, removeUser, listConversations, saveConversation, deleteConversation, listProjects, addProject, updateProject, removeProject } from './config/userStore.js';

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

// Web interface (chat + settings) served by the server itself
const publicDir = join(__dirname, '..', 'public');
if (existsSync(publicDir)) {
  app.use(express.static(publicDir));
}

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

// ============ Config API (powers the web settings UI) ============

// Localhost-only by default; ALLOW_REMOTE_CONFIG=true in .env releases the lock
const allowRemoteConfig = process.env.ALLOW_REMOTE_CONFIG === 'true';
const LOCAL_IPS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

function configGuard(req, res, next) {
  const ip = req.ip || req.socket?.remoteAddress || '';
  if (allowRemoteConfig || LOCAL_IPS.has(ip)) return next();
  res.status(403).json({
    error: {
      message: 'A configuracao so pode ser alterada a partir do servidor (localhost). Para liberar de outros PCs da rede, set ALLOW_REMOTE_CONFIG=true no .env.',
      type: 'forbidden',
    },
  });
}

const CONFIGURABLE_KEYS = new Set([
  'OPENROUTER_API_KEY', 'OPENROUTER_BASE_URL', 'OPENROUTER_REFERER', 'OPENROUTER_TITLE',
  'NVIDIA_API_KEY', 'NVIDIA_BASE_URL',
  'OLLAMA_BASE_URL', 'OLLAMA_MODELS',
  'LMSTUDIO_BASE_URL', 'LMSTUDIO_MODELS',
  'CUSTOM_AI_NAME', 'CUSTOM_AI_BASE_URL', 'CUSTOM_AI_API_KEY', 'CUSTOM_AI_MODELS',
  'CUSTOM_AI_CONTEXT_LENGTH', 'CUSTOM_AI_MAX_TOKENS',
  'ALLOW_REMOTE_CONFIG',
]);
for (const tpl of FREE_PROVIDER_TEMPLATES) {
  CONFIGURABLE_KEYS.add(tpl.envKey);
  CONFIGURABLE_KEYS.add(tpl.baseURLKey);
}

const STATIC_PROVIDERS = [
  { id: 'openrouter', name: 'OpenRouter', fields: ['OPENROUTER_API_KEY', 'OPENROUTER_BASE_URL', 'OPENROUTER_REFERER', 'OPENROUTER_TITLE'] },
  { id: 'nvidia', name: 'NVIDIA NIM', fields: ['NVIDIA_API_KEY', 'NVIDIA_BASE_URL'] },
];

function buildConfigStatus() {
  const active = providerFactory.getAvailableProviders();
  const entries = [];

  for (const sp of STATIC_PROVIDERS) {
    entries.push({
      id: sp.id, name: sp.name, active: active.includes(sp.id),
      fields: sp.fields.map(k => ({
        key: k, value: process.env[k] || '', masked: maskSecret(process.env[k]),
      })),
    });
  }

  for (const tpl of FREE_PROVIDER_TEMPLATES) {
    const fieldKeys = [tpl.envKey, ...(tpl.modelsEnvKey ? [tpl.modelsEnvKey] : []), ...(tpl.baseURLKey ? [tpl.baseURLKey] : [])];
    entries.push({
      id: tpl.id, name: tpl.name, active: active.includes(tpl.id),
      signup: tpl.signup, note: tpl.note,
      fields: fieldKeys.map(k => ({
        key: k, value: process.env[k] || '', masked: maskSecret(process.env[k]),
      })),
    });
  }

  entries.push({
    id: 'custom', name: 'Servidor próprio (CUSTOM_AI)',
    active: active.includes('custom'),
    note: 'Qualquer endpoint OpenAI-compatible (seu server, vLLM, LiteLLM...)',
    fields: ['CUSTOM_AI_NAME', 'CUSTOM_AI_BASE_URL', 'CUSTOM_AI_API_KEY', 'CUSTOM_AI_MODELS'].map(k => ({
      key: k, value: process.env[k] || '', masked: maskSecret(process.env[k]),
    })),
  });

  return {
    allowRemoteConfig,
    activeProviders: active,
    providers: entries,
    restartNote: 'Chaves de provedores aplicam na hora. PORT, HOST e ROTATION_STRATEGY exigem reiniciar o servidor.',
  };
}

app.get('/v1/config', configGuard, (req, res) => {
  res.json(buildConfigStatus());
});

app.post('/v1/config', configGuard, async (req, res) => {
  try {
    const updates = {};
    const rejected = [];
    for (const [key, value] of Object.entries(req.body || {})) {
      if (!CONFIGURABLE_KEYS.has(key)) { rejected.push(key); continue; }
      updates[key] = value == null ? '' : String(value).trim();
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: { message: 'Nada para salvar', rejected, type: 'invalid_request' } });
    }

    updateEnvFile(updates);

    // Hot reload: catalog -> clients -> rotation order
    rebuildProviders();
    providerFactory.reload({ timeout: config.requestTimeout });
    chatHandler.reloadModelOrder();

    logger.info({ providers: providerFactory.getAvailableProviders(), keys: Object.keys(updates) }, 'Config updated via web UI');

    res.json({
      success: true,
      applied: Object.keys(updates),
      rejected,
      activeProviders: providerFactory.getAvailableProviders(),
      ...buildConfigStatus(),
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Config save failed');
    res.status(500).json({ error: { message: error.message, type: 'server_error' } });
  }
});

// ============ Users (web chat login, managed locally) ============

// Public: the login screen needs the avatar list to pick "who am I"
app.get('/v1/users', (req, res) => {
  res.json({ users: getUsers() });
});

// Management: localhost-only (same guard as API keys)
app.post('/v1/users', configGuard, (req, res) => {
  try {
    const user = addUser(req.body || {});
    logger.info({ user: user.id, name: user.name }, 'User created via web UI');
    res.status(201).json({ success: true, user });
  } catch (error) {
    res.status(400).json({ error: { message: error.message, type: 'invalid_request' } });
  }
});

app.put('/v1/users/:id', configGuard, (req, res) => {
  try {
    const user = updateUser(req.params.id, req.body || {});
    res.json({ success: true, user });
  } catch (error) {
    res.status(400).json({ error: { message: error.message, type: 'invalid_request' } });
  }
});

app.delete('/v1/users/:id', configGuard, (req, res) => {
  try {
    removeUser(req.params.id);
    logger.info({ user: req.params.id }, 'User removed via web UI');
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: { message: error.message, type: 'invalid_request' } });
  }
});

// ============ Per-user conversations (no mixing between departments) ============

app.get('/v1/conversations', (req, res) => {
  res.json({ conversations: listConversations(req.query.userId) });
});

app.put('/v1/conversations/:id', (req, res) => {
  try {
    saveConversation(req.query.userId, req.body);
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: { message: error.message, type: 'invalid_request' } });
  }
});

app.delete('/v1/conversations/:id', (req, res) => {
  try {
    deleteConversation(req.query.userId, req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: { message: error.message, type: 'invalid_request' } });
  }
});

// ============ Projects (per user, groups conversations) ============

app.get('/v1/projects', (req, res) => {
  res.json({ projects: listProjects(req.query.userId) });
});

app.post('/v1/projects', (req, res) => {
  try {
    res.status(201).json({ success: true, project: addProject(req.query.userId, req.body || {}) });
  } catch (error) {
    res.status(400).json({ error: { message: error.message, type: 'invalid_request' } });
  }
});

app.put('/v1/projects/:id', (req, res) => {
  try {
    res.json({ success: true, project: updateProject(req.query.userId, req.params.id, req.body || {}) });
  } catch (error) {
    res.status(400).json({ error: { message: error.message, type: 'invalid_request' } });
  }
});

app.delete('/v1/projects/:id', (req, res) => {
  try {
    removeProject(req.query.userId, req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: { message: error.message, type: 'invalid_request' } });
  }
});

// ============ Image generation (free, no API key - Pollinations.ai) ============

const imagesDir = join(__dirname, '..', '..', 'data', 'images');

// Generated images are served at /files/images/<name>
app.use('/files/images', express.static(imagesDir, { maxAge: '30d', immutable: true }));

app.post('/v1/images/generate', async (req, res) => {
  try {
    const prompt = String(req.body?.prompt || '').trim();
    if (!prompt) {
      return res.status(400).json({ error: { message: 'Descreva a imagem (prompt obrigatorio)', type: 'invalid_request' } });
    }
    const width = Math.min(Math.max(parseInt(req.body?.width) || 1024, 256), 1536);
    const height = Math.min(Math.max(parseInt(req.body?.height) || 1024, 256), 1536);
    const seed = Number.isInteger(req.body?.seed) ? req.body.seed : Math.floor(Math.random() * 1000000);

    const upstream = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt.slice(0, 1200))}?width=${width}&height=${height}&seed=${seed}&nologo=true`;
    logger.info({ prompt: prompt.slice(0, 80), width, height, seed }, 'Image generation requested');

    const r = await fetch(upstream, { signal: AbortSignal.timeout(150000) });
    if (!r.ok) throw new Error(`Pollinations HTTP ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 1000) throw new Error('imagem vazia do upstream');

    mkdirSync(imagesDir, { recursive: true });
    const ext = (r.headers.get('content-type') || '').includes('png') ? 'png' : 'jpg';
    const name = `img_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6)}.${ext}`;
    writeFileSync(join(imagesDir, name), buf);

    logger.info({ file: name, bytes: buf.length }, 'Image generated');
    res.json({ success: true, url: `/files/images/${name}`, prompt, seed, width, height, bytes: buf.length });
  } catch (error) {
    logger.warn({ error: error.message }, 'Image generation failed');
    res.status(502).json({ error: { message: 'Falha ao gerar imagem: ' + error.message, type: 'server_error' } });
  }
});

// Root endpoint
const chatPage = join(publicDir, 'index.html');
app.get('/', (req, res) => {
  if (existsSync(chatPage)) return res.sendFile(chatPage);
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
      config: '/v1/config',
    },
    documentation: 'https://github.com/luizhenriqueamadeu/local-ai-server',
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
  if (existsSync(chatPage)) {
    logger.info(`🌐 Web chat em http://localhost:${config.port} (na rede: http://SEU_IP:${config.port})`);
  }
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