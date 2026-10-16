/**
 * Provider configurations for OpenRouter, NVIDIA and compatible providers
 * Defines available models, their capabilities, and pricing tiers
 */

import { buildCompatibleProviders } from './freeProviders.js';

export const PROVIDERS = {
  openrouter: {
    name: 'OpenRouter',
    baseURL: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
    apiKey: process.env.OPENROUTER_API_KEY,
    headers: {
      'HTTP-Referer': process.env.OPENROUTER_REFERER || 'http://localhost:3000',
      'X-Title': process.env.OPENROUTER_TITLE || 'Local AI Server',
    },
    models: {
      // Free tier models (priority) - Current as of 2026
      'nvidia/nemotron-3-ultra-550b-a55b:free': {
        id: 'nvidia/nemotron-3-ultra-550b-a55b:free',
        name: 'Nemotron 3 Ultra 550B (Free)',
        contextLength: 128000,
        maxOutputTokens: 4096,
        pricing: { input: 0, output: 0 },
        tier: 'free',
        capabilities: ['chat', 'reasoning', 'code', 'analysis'],
      },
      'nvidia/nemotron-3.5-lightning:free': {
        id: 'nvidia/nemotron-3.5-lightning:free',
        name: 'Nemotron 3.5 Lightning (Free)',
        contextLength: 128000,
        maxOutputTokens: 4096,
        pricing: { input: 0, output: 0 },
        tier: 'free',
        capabilities: ['chat', 'reasoning', 'code', 'analysis'],
      },
      'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free': {
        id: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
        name: 'Nemotron 3 Nano Omni 30B (Free)',
        contextLength: 128000,
        maxOutputTokens: 4096,
        pricing: { input: 0, output: 0 },
        tier: 'free',
        capabilities: ['chat', 'reasoning', 'code', 'analysis'],
      },
      'nvidia/nemotron-3-super-120b-a12b:free': {
        id: 'nvidia/nemotron-3-super-120b-a12b:free',
        name: 'Nemotron 3 Super 120B (Free)',
        contextLength: 128000,
        maxOutputTokens: 4096,
        pricing: { input: 0, output: 0 },
        tier: 'free',
        capabilities: ['chat', 'reasoning', 'code', 'analysis'],
      },
      'qwen/qwen3.8-27b:free': {
        id: 'qwen/qwen3.8-27b:free',
        name: 'Qwen 3.8 27B (Free)',
        contextLength: 128000,
        maxOutputTokens: 8192,
        pricing: { input: 0, output: 0 },
        tier: 'free',
        capabilities: ['chat', 'reasoning', 'code', 'multilingual'],
      },
      'google/gemma-4-26b-a4b-it:free': {
        id: 'google/gemma-4-26b-a4b-it:free',
        name: 'Gemma 4 26B (Free)',
        contextLength: 8192,
        maxOutputTokens: 8192,
        pricing: { input: 0, output: 0 },
        tier: 'free',
        capabilities: ['chat', 'reasoning', 'code'],
      },
      'google/gemma-4-31b-it:free': {
        id: 'google/gemma-4-31b-it:free',
        name: 'Gemma 4 31B (Free)',
        contextLength: 8192,
        maxOutputTokens: 8192,
        pricing: { input: 0, output: 0 },
        tier: 'free',
        capabilities: ['chat', 'reasoning', 'code'],
      },
      'poolside/laguna-xs-2.1:free': {
        id: 'poolside/laguna-xs-2.1:free',
        name: 'Poolside Laguna XS 2.1 (Free)',
        contextLength: 32768,
        maxOutputTokens: 8192,
        pricing: { input: 0, output: 0 },
        tier: 'free',
        capabilities: ['chat', 'reasoning', 'code'],
      },
      'cohere/north-mini-code:free': {
        id: 'cohere/north-mini-code:free',
        name: 'Cohere North Mini Code (Free)',
        contextLength: 32768,
        maxOutputTokens: 8192,
        pricing: { input: 0, output: 0 },
        tier: 'free',
        capabilities: ['chat', 'reasoning', 'code'],
      },

      // Low-cost models
      'meta-llama/llama-3.1-70b-instruct': {
        id: 'meta-llama/llama-3.1-70b-instruct',
        name: 'Llama 3.1 70B Instruct',
        contextLength: 131072,
        maxOutputTokens: 8192,
        pricing: { input: 0.00059, output: 0.00079 },
        tier: 'low-cost',
        capabilities: ['chat', 'reasoning', 'code', 'analysis'],
      },
      'google/gemini-flash-1.5': {
        id: 'google/gemini-flash-1.5',
        name: 'Gemini 1.5 Flash',
        contextLength: 1048576,
        maxOutputTokens: 8192,
        pricing: { input: 0.000075, output: 0.0003 },
        tier: 'low-cost',
        capabilities: ['chat', 'reasoning', 'code', 'multimodal'],
      },
      'anthropic/claude-3.5-haiku': {
        id: 'anthropic/claude-3.5-haiku',
        name: 'Claude 3.5 Haiku',
        contextLength: 200000,
        maxOutputTokens: 8192,
        pricing: { input: 0.00025, output: 0.00125 },
        tier: 'low-cost',
        capabilities: ['chat', 'reasoning', 'code', 'analysis'],
      },

      // Premium models
      'openai/gpt-4o': {
        id: 'openai/gpt-4o',
        name: 'GPT-4o',
        contextLength: 128000,
        maxOutputTokens: 16384,
        pricing: { input: 0.0025, output: 0.01 },
        tier: 'premium',
        capabilities: ['chat', 'reasoning', 'code', 'multimodal', 'analysis'],
      },
      'anthropic/claude-3.5-sonnet': {
        id: 'anthropic/claude-3.5-sonnet',
        name: 'Claude 3.5 Sonnet',
        contextLength: 200000,
        maxOutputTokens: 8192,
        pricing: { input: 0.003, output: 0.015 },
        tier: 'premium',
        capabilities: ['chat', 'reasoning', 'code', 'analysis'],
      },
    },
  },

  nvidia: {
    name: 'NVIDIA',
    baseURL: process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1',
    apiKey: process.env.NVIDIA_API_KEY,
    headers: {},
    models: {
      'nvidia/nemotron-3-ultra-550b-a55b': {
        id: 'nvidia/nemotron-3-ultra-550b-a55b',
        name: 'Nemotron 3 Ultra 550B',
        contextLength: 128000,
        maxOutputTokens: 4096,
        pricing: { input: 0, output: 0 },
        tier: 'free',
        capabilities: ['chat', 'reasoning', 'code', 'analysis'],
      },
      'nvidia/llama-3.1-nemotron-70b-instruct': {
        id: 'nvidia/llama-3.1-nemotron-70b-instruct',
        name: 'Llama 3.1 Nemotron 70B Instruct',
        contextLength: 128000,
        maxOutputTokens: 4096,
        pricing: { input: 0, output: 0 },
        tier: 'free',
        capabilities: ['chat', 'reasoning', 'code', 'analysis'],
      },
      'nvidia/llama-3.1-nemotron-ultra-253b-v1': {
        id: 'nvidia/llama-3.1-nemotron-ultra-253b-v1',
        name: 'Llama 3.1 Nemotron Ultra 253B',
        contextLength: 128000,
        maxOutputTokens: 4096,
        pricing: { input: 0, output: 0 },
        tier: 'free',
        capabilities: ['chat', 'reasoning', 'code', 'analysis'],
      },
      'nvidia/nemotron-3-super-120b-a12b': {
        id: 'nvidia/nemotron-3-super-120b-a12b',
        name: 'Nemotron 3 Super 120B',
        contextLength: 128000,
        maxOutputTokens: 4096,
        pricing: { input: 0, output: 0 },
        tier: 'free',
        capabilities: ['chat', 'reasoning', 'code', 'analysis'],
      },
      'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning': {
        id: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning',
        name: 'Nemotron 3 Nano Omni 30B',
        contextLength: 128000,
        maxOutputTokens: 4096,
        pricing: { input: 0, output: 0 },
        tier: 'free',
        capabilities: ['chat', 'reasoning', 'code', 'analysis'],
      },
      'mistralai/mistral-large': {
        id: 'mistralai/mistral-large',
        name: 'Mistral Large',
        contextLength: 128000,
        maxOutputTokens: 4096,
        pricing: { input: 0, output: 0 },
        tier: 'free',
        capabilities: ['chat', 'reasoning', 'code', 'multilingual'],
      },
      'nv-mistralai/mistral-nemo-12b-instruct': {
        id: 'nv-mistralai/mistral-nemo-12b-instruct',
        name: 'Mistral Nemo 12B Instruct',
        contextLength: 128000,
        maxOutputTokens: 4096,
        pricing: { input: 0, output: 0 },
        tier: 'free',
        capabilities: ['chat', 'reasoning', 'code'],
      },
      'nvidia/nemotron-4-340b-instruct': {
        id: 'nvidia/nemotron-4-340b-instruct',
        name: 'Nemotron 4 340B Instruct',
        contextLength: 128000,
        maxOutputTokens: 4096,
        pricing: { input: 0, output: 0 },
        tier: 'free',
        capabilities: ['chat', 'reasoning', 'code', 'analysis'],
      },
    },
  },
};

/**
 * AUTO-ACTIVATION: any provider from the free-provider list that has its
 * key configured in .env (or, for key-less local servers, its base URL)
 * is merged into the catalog. Catálogo final = OpenRouter + NVIDIA +
 * todos os provedores configurados (groq, gemini, ollama, custom, ...).
 */
Object.assign(PROVIDERS, buildCompatibleProviders());

export const MODEL_TIERS = ['free', 'low-cost', 'premium'];

export function getAllModels() {
  const allModels = {};
  for (const [providerId, provider] of Object.entries(PROVIDERS)) {
    for (const [modelId, model] of Object.entries(provider.models)) {
      allModels[modelId] = { ...model, provider: providerId };
    }
  }
  return allModels;
}

export function getModelsByTier(tier) {
  const allModels = getAllModels();
  return Object.entries(allModels)
    .filter(([, model]) => model.tier === tier)
    .map(([id, model]) => ({ id, ...model }));
}

export function getFreeModels() {
  return getModelsByTier('free');
}

export function getModelInfo(modelId) {
  const allModels = getAllModels();
  return allModels[modelId] || null;
}