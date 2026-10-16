/**
 * Provider Factory
 * Creates and manages provider clients
 */

import { OpenRouterClient } from './OpenRouterClient.js';
import { NVIDIAClient } from './NVIDIAClient.js';
import { PROVIDERS, getModelInfo } from '../config/providers.js';

export class ProviderFactory {
  constructor() {
    this.clients = new Map();
    this.initialized = false;
  }

  initialize(config = {}) {
    if (this.initialized) return;

    // Initialize OpenRouter
    if (PROVIDERS.openrouter.apiKey) {
      this.clients.set('openrouter', new OpenRouterClient({
        baseURL: PROVIDERS.openrouter.baseURL,
        apiKey: PROVIDERS.openrouter.apiKey,
        headers: PROVIDERS.openrouter.headers,
        timeout: config.timeout,
      }));
    }

    // Initialize NVIDIA
    if (PROVIDERS.nvidia.apiKey) {
      this.clients.set('nvidia', new NVIDIAClient({
        baseURL: PROVIDERS.nvidia.baseURL,
        apiKey: PROVIDERS.nvidia.apiKey,
        headers: PROVIDERS.nvidia.headers,
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
    // Fallback to string matching
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