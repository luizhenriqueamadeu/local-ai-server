/**
 * Model Rotation Manager
 * Handles automatic model switching based on rate limits, errors, and availability
 */

import { getAllModels, getFreeModels, getModelInfo } from '../config/providers.js';

export class ModelRotationManager {
  constructor(options = {}) {
    this.strategy = options.strategy || 'rate-limit';
    this.preserveContextEnabled = options.preserveContext !== false;
    this.maxContextMessages = options.maxContextMessages || 20;
    this.rateLimitRetryDelay = options.rateLimitRetryDelay || 5000;
    this.maxRetries = options.maxRetries || 3;

    // Model state tracking
    this.modelStates = new Map(); // modelId -> { errors, lastError, rateLimitedUntil, consecutiveFailures }
    this.currentModelIndex = 0;
    this.modelOrder = []; // Ordered list of model IDs to try

    // Context preservation
    this.conversationContexts = new Map(); // conversationId -> { messages, lastModel, reasoning }

    this.initializeModelOrder();
  }

  initializeModelOrder() {
    const freeModels = getFreeModels();
    const priorityModels = (process.env.FREE_MODELS_PRIORITY || '')
      .split(',')
      .map(m => m.trim())
      .filter(Boolean);

    // Start with priority free models, then all other free models
    const orderedFree = [
      ...priorityModels.filter(id => freeModels.some(m => m.id === id)),
      ...freeModels.filter(m => !priorityModels.includes(m.id)).map(m => m.id),
    ];

    this.modelOrder = orderedFree;
    this.currentModelIndex = 0;
  }

  /**
   * Get the current primary model
   */
  getCurrentModel() {
    if (this.modelOrder.length === 0) {
      return null;
    }
    return this.modelOrder[this.currentModelIndex % this.modelOrder.length];
  }

  /**
   * Get next available model (for rotation)
   */
  getNextModel(excludeModelId = null) {
    const startIndex = this.currentModelIndex + 1;
    for (let i = 0; i < this.modelOrder.length; i++) {
      const index = (startIndex + i) % this.modelOrder.length;
      const modelId = this.modelOrder[index];
      if (modelId !== excludeModelId && this.isModelAvailable(modelId)) {
        return modelId;
      }
    }
    return null;
  }

  /**
   * Check if a model is available (not rate limited, not too many failures)
   */
  isModelAvailable(modelId) {
    const state = this.modelStates.get(modelId);
    if (!state) return true;

    // Check if rate limited
    if (state.rateLimitedUntil && Date.now() < state.rateLimitedUntil) {
      return false;
    }

    // Check consecutive failures
    if (state.consecutiveFailures >= this.maxRetries) {
      return false;
    }

    return true;
  }

  /**
   * Record a successful request for a model
   */
  recordSuccess(modelId) {
    const state = this.modelStates.get(modelId) || {
      errors: 0,
      lastError: null,
      rateLimitedUntil: null,
      consecutiveFailures: 0,
    };
    state.consecutiveFailures = 0;
    state.lastError = null;
    this.modelStates.set(modelId, state);
  }

  /**
   * Record an error for a model
   */
  recordError(modelId, error) {
    const state = this.modelStates.get(modelId) || {
      errors: 0,
      lastError: null,
      rateLimitedUntil: null,
      consecutiveFailures: 0,
    };

    state.errors++;
    state.lastError = {
      message: error.message,
      code: error.code,
      status: error.status,
      timestamp: Date.now(),
    };
    state.consecutiveFailures++;

    // Check for rate limit errors
    if (this.isRateLimitError(error)) {
      const retryAfter = this.extractRetryAfter(error) || this.rateLimitRetryDelay;
      state.rateLimitedUntil = Date.now() + retryAfter;
      console.log(`[ModelRotation] Model ${modelId} rate limited, retry after ${retryAfter}ms`);
    }

    this.modelStates.set(modelId, state);

    // If too many failures, rotate to next model
    if (state.consecutiveFailures >= this.maxRetries) {
      this.rotateToNext(modelId);
    }
  }

  /**
   * Check if error is a rate limit error
   */
  isRateLimitError(error) {
    const status = error.status || error.response?.status;
    const code = error.code || error.response?.data?.error?.code;
    const message = error.message || error.response?.data?.error?.message || '';

    return (
      status === 429 ||
      status === 503 ||
      status === 408 ||
      code === 'rate_limit_exceeded' ||
      code === 'rate_limit' ||
      code === 'service_unavailable' ||
      code === 'TIMEOUT' ||
      code === 'ECONNABORTED' ||
      code === 'ETIMEDOUT' ||
      message.includes('rate limit') ||
      message.includes('quota exceeded') ||
      message.includes('too many requests') ||
      message.includes('overloaded') ||
      message.includes('temporarily unavailable') ||
      message.includes('timeout') ||
      message.includes('Timeout') ||
      message.includes('timed out') ||
      message.includes('aborted due to timeout')
    );
  }

  /**
   * Extract retry-after from error
   */
  extractRetryAfter(error) {
    const headers = error.response?.headers;
    if (headers) {
      const retryAfter = headers['retry-after'] || headers['x-ratelimit-reset'];
      if (retryAfter) {
        const seconds = parseInt(retryAfter, 10);
        if (!isNaN(seconds)) {
          return seconds * 1000;
        }
      }
    }
    return null;
  }

  /**
   * Rotate to the next available model
   */
  rotateToNext(currentModelId = null) {
    const nextModel = this.getNextModel(currentModelId);
    if (nextModel) {
      const oldIndex = this.currentModelIndex;
      this.currentModelIndex = this.modelOrder.indexOf(nextModel);
      console.log(`[ModelRotation] Rotating from ${this.modelOrder[oldIndex]} to ${nextModel}`);
      return nextModel;
    }
    console.warn('[ModelRotation] No available models to rotate to!');
    return null;
  }

  /**
   * Get the best model for a request (considering capabilities needed)
   */
  getBestModel(requiredCapabilities = []) {
    // First try current model if it has required capabilities
    const currentModelId = this.getCurrentModel();
    if (currentModelId) {
      const modelInfo = getModelInfo(currentModelId);
      if (modelInfo && this.hasCapabilities(modelInfo, requiredCapabilities) && this.isModelAvailable(currentModelId)) {
        return currentModelId;
      }
    }

    // Find next available model with required capabilities
    for (let i = 0; i < this.modelOrder.length; i++) {
      const index = (this.currentModelIndex + i) % this.modelOrder.length;
      const modelId = this.modelOrder[index];
      const modelInfo = getModelInfo(modelId);
      if (modelInfo && this.hasCapabilities(modelInfo, requiredCapabilities) && this.isModelAvailable(modelId)) {
        this.currentModelIndex = index;
        return modelId;
      }
    }

    // Fallback to any available model
    return this.getNextModel();
  }

  hasCapabilities(modelInfo, requiredCapabilities) {
    if (!requiredCapabilities || requiredCapabilities.length === 0) return true;
    return requiredCapabilities.every(cap => modelInfo.capabilities?.includes(cap));
  }

  /**
   * Preserve conversation context when switching models
   */
  preserveContext(conversationId, messages, modelId, reasoning = null) {
    if (!this.preserveContextEnabled) return;

    // Keep only the last N messages to avoid context overflow
    const trimmedMessages = messages.slice(-this.maxContextMessages);

    this.conversationContexts.set(conversationId, {
      messages: trimmedMessages,
      lastModel: modelId,
      reasoning,
      timestamp: Date.now(),
    });
  }

  /**
   * Get preserved context for a conversation
   */
  getContext(conversationId) {
    return this.conversationContexts.get(conversationId) || null;
  }

  /**
   * Build messages array with preserved context for model switch
   */
  buildMessagesWithContext(conversationId, newMessages, systemPrompt = null) {
    const context = this.getContext(conversationId);
    if (!context) {
      const messages = [];
      if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
      return [...messages, ...newMessages];
    }

    // Detect if we're switching models
    const currentModelId = this.getCurrentModel();
    const isModelSwitch = context.lastModel && context.lastModel !== currentModelId;

    const messages = [];

    // Add system prompt
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }

    // If switching models, add a context transfer message
    if (isModelSwitch && context.messages.length > 0) {
      const contextSummary = this.summarizeContext(context.messages);
      messages.push({
        role: 'system',
        content: `[Context from previous model (${context.lastModel}):\n${contextSummary}\n\nContinue the conversation naturally, maintaining the reasoning and context established above.]`,
      });
    }

    // Add previous messages (trimmed)
    messages.push(...context.messages);

    // Add new messages
    messages.push(...newMessages);

    return messages;
  }

  /**
   * Summarize context for transfer between models
   */
  summarizeContext(messages) {
    // Simple summarization: keep last few user/assistant exchanges
    const relevantMessages = messages.filter(m => m.role === 'user' || m.role === 'assistant');
    const recent = relevantMessages.slice(-6);

    return recent
      .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.substring(0, 500)}`)
      .join('\n\n');
  }

  /**
   * Get status of all models
   */
  getStatus() {
    const status = {};
    for (const modelId of this.modelOrder) {
      const state = this.modelStates.get(modelId) || {};
      const modelInfo = getModelInfo(modelId);
      status[modelId] = {
        name: modelInfo?.name || modelId,
        provider: modelInfo?.provider,
        tier: modelInfo?.tier,
        available: this.isModelAvailable(modelId),
        current: modelId === this.getCurrentModel(),
        errors: state.errors || 0,
        consecutiveFailures: state.consecutiveFailures || 0,
        rateLimitedUntil: state.rateLimitedUntil,
        lastError: state.lastError,
      };
    }
    return status;
  }

  /**
   * Reset model state (e.g., after rate limit expires)
   */
  resetModelState(modelId) {
    this.modelStates.delete(modelId);
  }

  /**
   * Manually set current model
   */
  setCurrentModel(modelId) {
    const index = this.modelOrder.indexOf(modelId);
    if (index !== -1) {
      this.currentModelIndex = index;
      return true;
    }
    return false;
  }
}

export default ModelRotationManager;