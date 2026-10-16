/**
 * Provider Factory
 * Creates and manages provider clients
 */

import { OpenRouterClient } from './OpenRouterClient.js';
import { NVIDIAClient } from './NVIDIAClient.js';
import { OpenAICompatibleClient } from './OpenAICompatibleClient.js';
import { PROVIDERS, getModelInfo } from '../config/providers.js';

export class ProviderFactory {
  constructor() {
    this.clients = new Map();
    this.initialized = false;
  }

  initialize(config = {}) {
    if (this.initialized) return;

    // Register every provider in the catalog that is actually available:
    // - providers with an API key (OpenRouter, NVIDIA, groq, gemini, ...)
    // - key-less providers (ollama, custom) already filtered by config
    // Providers without a key in .env are simply NOT registered.
    for (const [providerId, provider] of Object.entries(PROVIDERS)) {
      const needsKey = provider.requiresKey !== false;
      if (needsKey && !provider.apiKey) continue;

      const ClientClass =
        providerId === 'openrouter' ? OpenRouterClient :
        providerId === 'nvidia' ? NVIDIAClient :
        OpenAICompatibleClient;

      this.clients.set(providerId, new ClientClass({
        baseURL: provider.baseURL,
        apiKey: provider.apiKey || 'not-needed', // for key-less local providers
        headers: provider.headers,
        timeout: config.timeout,
      }));
    }

    this.initialized = true;
    console.log(`[ProviderFactory] Initialized ${this.clients.size} providers: ${Array.from(this.clients.keys()).join(', ')}`);
  }

  getClient(providerId) {
    return this.clients.get(providerId);
  }

  getClientForModel(modelId) {
    // Determine provider from model config
    const modelInfo = getModelInfo(modelId);
    if (modelInfo && modelInfo.provider) {
      return this.clients.get(modelInfo.provider);
    }
    // Fallback: use the model prefix as provider id (groq/, ollama/, custom/, ...)
    const prefixMatch = modelId.match(/^([^/]+)/);
    if (prefixMatch && this.clients.has(prefixMatch[1])) {
      return this.clients.get(prefixMatch[1]);
    }
    // Fallback to string matching for NVIDIA-hosted models
    if (modelId.startsWith('nvidia/') || modelId.startsWith('nv-mistralai/') || modelId === 'mistralai/mistral-large') {
      return this.clients.get('nvidia');
    }
    return this.clients.get('openrouter');
  }

  getProviderForModel(modelId) {
    const modelInfo = getModelInfo(modelId);
    if (modelInfo && modelInfo.provider) {
      return modelInfo.provider;
    }
    const prefixMatch = modelId.match(/^([^/]+)/);
    if (prefixMatch && this.clients.has(prefixMatch[1])) {
      return prefixMatch[1];
    }
    if (modelId.startsWith('nvidia/') || modelId.startsWith('nv-mistralai/') || modelId === 'mistralai/mistral-large') {
      return 'nvidia';
    }
    return 'openrouter';
  }

  getAvailableProviders() {
    return Array.from(this.clients.keys());
  }

  hasProvider(providerId) {
    return this.clients.has(providerId);
  }

  async healthCheck() {
    const results = {};
    for (const [providerId, client] of this.clients) {
      try {
        await client.listModels();
        results[providerId] = { status: 'healthy', timestamp: Date.now() };
      } catch (error) {
        results[providerId] = { status: 'unhealthy', error: error.message, timestamp: Date.now() };
      }
    }
    return results;
  }
}

// Singleton instance
export const providerFactory = new ProviderFactory();

export default ProviderFactory;