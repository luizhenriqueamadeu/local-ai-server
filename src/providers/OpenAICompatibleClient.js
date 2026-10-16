/**
 * Generic OpenAI-compatible Provider Client
 *
 * Works with any provider that exposes an OpenAI-style /chat/completions API:
 * Groq, Gemini (OpenAI endpoint), Cerebras, Together, HuggingFace, Mistral,
 * DeepSeek, OpenAI, Ollama, LM Studio, vLLM, LiteLLM, or your own servers.
 */

import { BaseProviderClient } from './BaseProviderClient.js';

export class OpenAICompatibleClient extends BaseProviderClient {
  constructor(config) {
    super({
      name: config.name || 'OpenAICompatible',
      baseURL: config.baseURL,
      apiKey: config.apiKey,
      headers: config.headers,
      timeout: config.timeout,
    });
  }

  async chatCompletion(payload) {
    const isStreaming = payload.stream === true;
    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      const message =
        data.error?.message ||
        (Array.isArray(data.error) && data.error[0]?.message) ||
        data.message ||
        `HTTP ${response.status}`;
      const error = new Error(message);
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

  transformRequest(payload) {
    if (!payload.model) {
      throw new Error('Model is required');
    }
    return payload;
  }

  transformResponse(response) {
    return response;
  }
}

export default OpenAICompatibleClient;
