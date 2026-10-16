/**
 * OpenRouter Provider Client
 */

import { BaseProviderClient } from './BaseProviderClient.js';

export class OpenRouterClient extends BaseProviderClient {
  constructor(config) {
    super({
      name: 'OpenRouter',
      baseURL: config.baseURL || 'https://openrouter.ai/api/v1',
      apiKey: config.apiKey,
      headers: config.headers,
      timeout: config.timeout,
    });
  }

  async chatCompletion(payload) {
    // OpenRouter uses OpenAI-compatible format
    const isStreaming = payload.stream === true;
    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      const error = new Error(data.error?.message || `HTTP ${response.status}`);
      error.status = response.status;
      error.code = data.error?.code;
      error.response = { status: response.status, data, headers: response.headers };
      throw error;
    }

    if (isStreaming) {
      // Return raw response for streaming
      return response;
    }

    // Return parsed JSON for non-streaming
    return response.json();
  }

  async listModels() {
    return this.request('/models', { method: 'GET' });
  }

  /**
   * Transform OpenAI-format request to OpenRouter format (if needed)
   * OpenRouter is mostly OpenAI-compatible
   */
  transformRequest(payload) {
    // Add OpenRouter-specific parameters if needed
    const transformed = { ...payload };

    // Ensure model is specified
    if (!transformed.model) {
      throw new Error('Model is required for OpenRouter');
    }

    return transformed;
  }

  /**
   * Transform OpenRouter response to standard format
   */
  transformResponse(response) {
    // OpenRouter returns OpenAI-compatible format
    return response;
  }
}

export default OpenRouterClient;