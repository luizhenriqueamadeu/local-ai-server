/**
 * Chat Completion Handler
 * Orchestrates model rotation, context preservation, and provider communication
 */

import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';
import { providerFactory, ProviderFactory } from '../providers/ProviderFactory.js';
import { ModelRotationManager } from './ModelRotationManager.js';
import { getModelInfo, getAllModels, PROVIDERS } from '../config/providers.js';

export class ChatCompletionHandler {
  constructor(options = {}) {
    this.rotationManager = new ModelRotationManager({
      strategy: options.rotationStrategy || 'rate-limit',
      preserveContext: options.preserveContext !== false,
      maxContextMessages: options.maxContextMessages || 20,
      rateLimitRetryDelay: options.rateLimitRetryDelay || 5000,
      maxRetries: options.maxRetries || 3,
    });

    this.providerFactory = options.providerFactory || providerFactory;
    this.defaultModel = options.defaultModel || this.rotationManager.getCurrentModel();
    this.requestTimeout = options.requestTimeout || 120000;

    // Response cache (exact-match; semantic cache requires embeddings, see README)
    this.cacheConfig = {
      enabled: process.env.ENABLE_CACHE !== 'false' && process.env.CACHE_ENABLED !== 'false',
      ttl: parseInt(process.env.CACHE_TTL_SECONDS || '60', 10) * 1000,
      max: parseInt(process.env.CACHE_MAX || '200', 10),
    };
    this.cache = new Map();

    // Per-request observability (in-memory; resets on restart)
    this.stats = {
      requests: 0,
      successes: 0,
      failures: 0,
      cacheHits: 0,
      totalLatencyMs: 0,
      totalPromptTokens: 0,
      totalCompletionTokens: 0,
      startedAt: Date.now(),
      recent: [], // ring buffer
    };
    this.STATS_MAX_RECENT = 100;
  }

  /**
   * Handle chat completion request with automatic model rotation
   */
  async handleChatCompletion(requestBody, requestHeaders = {}) {
    console.log('[DEBUG] Request body:', JSON.stringify(requestBody, null, 2));
    const {
      model,
      messages,
      stream = false,
      temperature,
      max_tokens,
      max_completion_tokens,
      top_p,
      frequency_penalty,
      presence_penalty,
      stop,
      user,
      ...extraParams
    } = requestBody;

    // Generate conversation ID for context tracking
    const conversationId = requestHeaders['x-conversation-id'] || uuidv4();
    const isStreaming = stream;

    // Determine which model to use
    let targetModel = model;
    let modelInfo = null;

    if (!targetModel || targetModel === 'auto') {
      // Auto-select best available model
      targetModel = this.rotationManager.getBestModel();
      if (!targetModel) {
        throw new Error('No available models');
      }
    }

    modelInfo = getModelInfo(targetModel);
    if (!modelInfo) {
      throw new Error(`Unknown model: ${targetModel}`);
    }

    // Get provider for this model
    const providerId = this.providerFactory.getProviderForModel(targetModel);
    const client = this.providerFactory.getClient(providerId);

    if (!client) {
      throw new Error(`Provider not available for model: ${targetModel} (provider: ${providerId})`);
    }

    // Build messages with context preservation
    const systemPrompt = this.extractSystemPrompt(messages);
    const userMessages = messages.filter(m => m.role !== 'system');
    const finalMessages = this.rotationManager.buildMessagesWithContext(conversationId, userMessages, systemPrompt);

    // Prepare payload (upstream model id is sent to the provider; the
    // prefixed catalog id chain `groq/llama-...` stays internal)
    const payload = {
      model: modelInfo.upstreamId || targetModel,
      messages: finalMessages,
      stream: isStreaming,
      temperature: temperature ?? 0.7,
      max_tokens: max_tokens || max_completion_tokens || modelInfo.maxOutputTokens || 4096,
      top_p: top_p ?? 1,
      frequency_penalty: frequency_penalty ?? 0,
      presence_penalty: presence_penalty ?? 0,
      stop,
      user,
      ...extraParams,
    };

    // Tool-call normalization: strip tools upfront for providers that don't support them
    if (payload.tools && PROVIDERS[providerId]?.supportsTools === false) {
      delete payload.tools;
      delete payload.tool_choice;
      console.log(`[ChatCompletion] Provider ${providerId} does not support tools; sent without them`);
    }

    // Tool-call normalization: strip tools upfront for providers that don't support them
    if (payload.tools && PROVIDERS[providerId]?.supportsTools === false) {
      delete payload.tools;
      delete payload.tool_choice;
      console.log(`[ChatCompletion] Provider ${providerId} does not support tools; sent without them`);
    }

    // Attempt completion with rotation on failure
    return this.executeWithRotation(
      conversationId,
      targetModel,
      providerId,
      client,
      payload,
      isStreaming,
      finalMessages
    );
  }

  /**
   * Execute chat completion with automatic rotation on failure,
   * per-request observability, response cache and tools fallback
   */
  async executeWithRotation(conversationId, initialModel, providerId, client, payload, isStreaming, originalMessages) {
    let currentModel = initialModel;
    let currentProviderId = providerId;
    let currentClient = client;
    let attempts = 0;
    let toolsStripped = false;
    const maxAttempts = this.rotationManager.modelOrder.length;
    const startedAt = Date.now();
    const tries = []; // observability: one entry per attempt

    // Cache lookup (exact match, non-streaming only)
    const cacheKey = !isStreaming && this.cacheConfig.enabled ? this.cacheKeyOf(payload) : null;
    if (cacheKey) {
      const hit = this.cacheGet(cacheKey);
      if (hit) {
        this.pushStat({ model: currentModel, provider: currentProviderId, ok: true, cached: true, latencyMs: 0, attempts: [], usage: null });
        return { ...hit, cached: true };
      }
    }

    while (attempts < maxAttempts) {
      const attemptStart = Date.now();
      try {
        console.log(`[ChatCompletion] Attempting with model: ${currentModel} (provider: ${currentProviderId})`);
        const response = await currentClient.chatCompletion(payload);

        // Some upstreams return HTTP 200 with an embedded error body — treat as failure and rotate
        if (!isStreaming && (!response || !Array.isArray(response.choices) || !response.choices.length || response.error)) {
          const message = response?.error?.message || 'Provider returned an empty/malformed response';
          throw Object.assign(new Error(message), {
            status: Number(response?.error?.code) || 502,
            responseError: true,
          });
        }

        tries.push({ model: currentModel, ms: Date.now() - attemptStart, error: null });

        // Success - record and return
        this.rotationManager.recordSuccess(currentModel);

        // Preserve context for future requests
        this.rotationManager.preserveContext(conversationId, originalMessages, currentModel);

        // Add model info to response
        if (!isStreaming && response) {
          response.model = currentModel;
          response.provider = currentProviderId;
        }

        // Observability + cache (non-streaming only)
        if (!isStreaming && response) {
          const usage = response.usage || null;
          this.pushStat({
            model: currentModel,
            provider: currentProviderId,
            ok: true,
            cached: false,
            latencyMs: Date.now() - startedAt,
            attempts: tries,
            usage: usage
              ? { prompt: usage.prompt_tokens ?? null, completion: usage.completion_tokens ?? null, total: usage.total_tokens ?? null }
              : null,
          });
          if (cacheKey) this.cacheSet(cacheKey, response);
        }

        return response;
      } catch (error) {
        tries.push({ model: currentModel, ms: Date.now() - attemptStart, error: (error.message || '').slice(0, 160) });
        console.error(`[ChatCompletion] Error with ${currentModel}:`, error.message);
        this.rotationManager.recordError(currentModel, error);

        // Tool-call fallback: provider rejected tools -> retry same model without them
        if (payload.tools && this.isToolRejection(error)) {
          delete payload.tools;
          delete payload.tool_choice;
          toolsStripped = true;
          console.log(`[ChatCompletion] Provider rejected tools; retrying ${currentModel} without them`);
          continue; // same model, no rotation
        }

        // Check if we should rotate
        const nextModel = this.rotationManager.getNextModel(currentModel);
        if (!nextModel) {
          this.pushStat({
            model: currentModel, provider: currentProviderId, ok: false, cached: false,
            latencyMs: Date.now() - startedAt, attempts: tries, usage: null,
            error: `all models exhausted: ${(error.message || '').slice(0, 120)}`,
          });
          throw new Error(`All models exhausted. Last error: ${error.message}`);
        }

        // Rotate to next model
        currentModel = nextModel;
        currentProviderId = this.providerFactory.getProviderForModel(currentModel);
        currentClient = this.providerFactory.getClient(currentProviderId);

        if (!currentClient) {
          console.warn(`[ChatCompletion] No client for rotated model ${currentModel}, trying next...`);
          attempts++;
          continue;
        }

        // Strip tools again if the new provider lacks support
        if (payload.tools && PROVIDERS[currentProviderId]?.supportsTools === false) {
          delete payload.tools;
          delete payload.tool_choice;
        }

        // Update payload with new model (upstream id for the new provider)
        const rotatedInfo = getModelInfo(currentModel);
        payload.model = rotatedInfo?.upstreamId || currentModel;

        // Rebuild messages with context for new model
        const systemPrompt = this.extractSystemPrompt(originalMessages);
        const userMessages = originalMessages.filter(m => m.role !== 'system');
        payload.messages = this.rotationManager.buildMessagesWithContext(conversationId, userMessages, systemPrompt);

        attempts++;
        console.log(`[ChatCompletion] Rotated to ${currentModel}, attempt ${attempts}/${maxAttempts}`);
      }
    }

    this.pushStat({
      model: currentModel, provider: currentProviderId, ok: false, cached: false,
      latencyMs: Date.now() - startedAt, attempts: tries, usage: null,
      error: 'max rotation attempts reached',
    });
    throw new Error('Max rotation attempts reached');
  }

  /**
   * Does this error look like a provider rejecting tool/function calling?
   */
  isToolRejection(error) {
    const status = error.status || error.response?.status;
    const msg = ((error.message || '') + ' ' + (error.response?.data?.error?.message || '')).toLowerCase();
    if (status && ![400, 404, 422, 500].includes(Number(status))) return false;
    return /tool|function/.test(msg);
  }

  // ---------- Observability ----------

  pushStat(entry) {
    const s = this.stats;
    s.requests++;
    if (entry.cached) {
      s.cacheHits++;
      s.successes++;
    } else if (entry.ok) {
      s.successes++;
      s.totalLatencyMs += entry.latencyMs || 0;
      if (entry.usage) {
        s.totalPromptTokens += entry.usage.prompt || 0;
        s.totalCompletionTokens += entry.usage.completion || 0;
      }
    } else {
      s.failures++;
    }
    s.recent.unshift({ ts: Date.now(), ...entry });
    s.recent = s.recent.slice(0, this.STATS_MAX_RECENT);
  }

  /**
   * Aggregated observability snapshot: GET /v1/stats
   */
  getStats() {
    const s = this.stats;
    const perModel = {};
    for (const r of s.recent) {
      if (r.cached) continue;
      if (!perModel[r.model]) {
        perModel[r.model] = { model: r.model, provider: r.provider || null, requests: 0, totalLatencyMs: 0, tokensIn: 0, tokensOut: 0 };
      }
      const per = perModel[r.model];
      if (r.ok) {
        per.requests++;
        per.totalLatencyMs += r.latencyMs || 0;
        if (r.usage) { per.tokensIn += r.usage.prompt || 0; per.tokensOut += r.usage.completion || 0; }
      }
    }
    for (const per of Object.values(perModel)) {
      per.avgLatencyMs = per.requests > 0 ? Math.round(per.totalLatencyMs / per.requests) : 0;
      per.totalLatencyMs = undefined;
    }
    const realSuccesses = s.successes - s.cacheHits;
    return {
      since: new Date(s.startedAt).toISOString(),
      note: 'in-memory (resets when the server restarts)',
      summary: {
        requests: s.requests,
        successes: s.successes,
        failures: s.failures,
        okRate: s.requests > 0 ? Math.round((s.successes / s.requests) * 100) + '%' : '—',
        cacheHits: s.cacheHits,
        avgLatencyMs: realSuccesses > 0 ? Math.round(s.totalLatencyMs / realSuccesses) : 0,
        totalPromptTokens: s.totalPromptTokens,
        totalCompletionTokens: s.totalCompletionTokens,
      },
      models: Object.values(perModel),
      recent: s.recent.slice(0, 50),
      circuitsOpen: Object.entries(this.rotationManager.getStatus())
        .filter(([, st]) => st.circuitOpen).map(([id, st]) => ({ id, until: st.circuitUntil })),
    };
  }

  // ---------- Response cache ----------

  cacheKeyOf(payload) {
    const { stream, user, ...rest } = payload;
    return createHash('sha1').update(JSON.stringify(rest)).digest('hex');
  }

  cacheGet(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expires) { this.cache.delete(key); return null; }
    return entry.response;
  }

  cacheSet(key, response) {
    if (!this.cacheConfig.enabled || !key) return;
    this.cache.set(key, { response: JSON.parse(JSON.stringify(response)), expires: Date.now() + this.cacheConfig.ttl });
    if (this.cache.size > this.cacheConfig.max) {
      const oldest = this.cache.keys().next().value;
      this.cache.delete(oldest);
    }
  }

  /**
   * Extract system prompt from messages
   */
  extractSystemPrompt(messages) {
    const systemMessages = messages.filter(m => m.role === 'system');
    if (systemMessages.length === 0) return null;
    return systemMessages.map(m => m.content).join('\n\n');
  }

  /**
   * Handle streaming response
   */
  async *handleStreaming(response, model, provider) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') {
              yield `data: ${JSON.stringify({ ...this.createStreamChunk('', model, provider), choices: [{ delta: {}, finish_reason: 'stop', index: 0 }] })}\n\n`;
              yield 'data: [DONE]\n\n';
              return;
            }

            try {
              const parsed = JSON.parse(data);
              // Ensure model info is in stream chunks
              if (parsed.choices?.[0]?.delta) {
                parsed.model = model;
                parsed.provider = provider;
              }
              yield `data: ${JSON.stringify(parsed)}\n\n`;
            } catch (e) {
              // Pass through unparseable lines
              yield `${line}\n\n`;
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  createStreamChunk(content, model, provider) {
    return {
      id: `chatcmpl-${Date.now()}`,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model,
      provider,
      choices: [{ delta: { content }, index: 0, finish_reason: null }],
    };
  }

  /**
   * Rebuild rotation order after providers were reloaded
   * (e.g. new provider keys saved through the web settings UI)
   */
  reloadModelOrder() {
    this.rotationManager.rebuildModelOrder();
  }

  /**
   * Get available models list (OpenAI-compatible format)
   */
  async listModels() {
    const allModels = getAllModels();
    const models = [];

    for (const [modelId, modelInfo] of Object.entries(allModels)) {
      const providerId = this.providerFactory.getProviderForModel(modelId);
      const client = this.providerFactory.getClient(providerId);
      const available = client && this.rotationManager.isModelAvailable(modelId);

      models.push({
        id: modelId,
        object: 'model',
        created: Math.floor(Date.now() / 1000),
        owned_by: providerId,
        permission: [],
        root: modelId,
        parent: null,
        context_length: modelInfo.contextLength,
        max_output_tokens: modelInfo.maxOutputTokens,
        pricing: modelInfo.pricing,
        tier: modelInfo.tier,
        capabilities: modelInfo.capabilities,
        available,
        current: modelId === this.rotationManager.getCurrentModel(),
      });
    }

    return { object: 'list', data: models };
  }

  /**
   * Get rotation status
   */
  getRotationStatus() {
    return this.rotationManager.getStatus();
  }

  /**
   * Manually set current model
   */
  setCurrentModel(modelId) {
    return this.rotationManager.setCurrentModel(modelId);
  }

  /**
   * Reset model state
   */
  resetModelState(modelId) {
    this.rotationManager.resetModelState(modelId);
  }
}

export default ChatCompletionHandler;