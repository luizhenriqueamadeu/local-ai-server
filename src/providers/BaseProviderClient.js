/**
 * Base Provider Client
 * Abstract class for API providers
 */

export class BaseProviderClient {
  constructor(config) {
    this.name = config.name;
    this.baseURL = config.baseURL;
    this.apiKey = config.apiKey;
    this.defaultHeaders = config.headers || {};
    this.timeout = config.timeout || 120000;
  }

  getHeaders() {
    const headers = {
      'Content-Type': 'application/json',
      ...this.defaultHeaders,
    };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }
    return headers;
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          ...this.getHeaders(),
          ...options.headers,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const error = new Error(data.error?.message || `HTTP ${response.status}`);
        error.status = response.status;
        error.code = data.error?.code;
        error.response = { status: response.status, data, headers: response.headers };
        throw error;
      }

      return data;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        const timeoutError = new Error('Request timeout');
        timeoutError.code = 'TIMEOUT';
        throw timeoutError;
      }
      throw error;
    }
  }

  async chatCompletion(payload) {
    throw new Error('chatCompletion must be implemented by subclass');
  }

  async listModels() {
    throw new Error('listModels must be implemented by subclass');
  }
}

export default BaseProviderClient;