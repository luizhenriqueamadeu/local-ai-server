/**
 * NVIDIA Provider Client
 * NVIDIA API is OpenAI-compatible but with some differences
 */

import { BaseProviderClient } from './BaseProviderClient.js';

export class NVIDIAClient extends BaseProviderClient {
  constructor(config) {
    super({
      name: 'NVIDIA',
      baseURL: config.baseURL || 'https://integrate.api.nvidia.com/v1',
      apiKey: config.apiKey,
      headers: config.headers,
      timeout: config.timeout,
    });
  }

  async chatCompletion(payload) {
    // NVIDIA uses OpenAI-compatible format
    const isStreaming = payload.stream === true;
    const transformedPayload = this.transformRequest(payload);
    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(transformedPayload),
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
   * Transform request for NVIDIA API
   */
  transformRequest(payload) {
    const transformed = { ...payload };

    // NVIDIA requires model parameter
    if (!transformed.model) {
      throw new Error('Model is required for NVIDIA');
    }

    // NVIDIA may not support all OpenAI parameters
    // Remove unsupported parameters
    const unsupportedParams = ['user', 'function_call', 'functions', 'tool_choice', 'tools'];
    for (const param of unsupportedParams) {
      delete transformed[param];
    }

    // Handle max_tokens -> max_tokens (NVIDIA uses max_tokens)
    if (transformed.max_completion_tokens && !transformed.max_tokens) {
      transformed.max_tokens = transformed.max_completion_tokens;
      delete transformed.max_completion_tokens;
    }

    return transformed;
  }

  /**
   * Transform NVIDIA response to standard OpenAI format
   */
  transformResponse(response) {
    // NVIDIA returns OpenAI-compatible format
    return response;
  }
}

export default NVIDIAClient;