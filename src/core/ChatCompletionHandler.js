/**
 * Chat Completion Handler
 * Orchestrates model rotation, context preservation, and provider communication
 */

import { v4 as uuidv4 } from 'uuid';
import { providerFactory, ProviderFactory } from '../providers/ProviderFactory.js';
import { ModelRotationManager } from './ModelRotationManager.js';
import { getModelInfo, getAllModels } from '../config/providers.js';

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
   * Execute chat completion with automatic rotation on failure
   */
  async executeWithRotation(conversationId, initialModel, providerId, client, payload, isStreaming, originalMessages) {
    let currentModel = initialModel;
    let currentProviderId = providerId;
    let currentClient = client;
    let attempts = 0;
    const maxAttempts = this.rotationManager.modelOrder.length;

    while (attempts < maxAttempts) {
      try {
        console.log(`[ChatCompletion] Attempting with model: ${currentModel} (provider: ${currentProviderId})`);

        const response = await currentClient.chatCompletion(payload);

        // Success - record and return
        this.rotationManager.recordSuccess(currentModel);

        // Preserve context for future requests
        this.rotationManager.preserveContext(conversationId, originalMessages, currentModel);

        // Add model info to response
        if (!isStreaming && response) {
          response.model = currentModel;
          response.provider = currentProviderId;
        }

        return response;
      } catch (error) {
        console.error(`[ChatCompletion] Error with ${currentModel}:`, error.message);
        this.rotationManager.recordError(currentModel, error);

        // Check if we should rotate
        const nextModel = this.rotationManager.getNextModel(currentModel);
        if (!nextModel) {
          // No more models to try
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

    throw new Error('Max rotation attempts reached');
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