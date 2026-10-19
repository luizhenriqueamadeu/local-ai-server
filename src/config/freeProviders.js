/**
 * Ready-to-go list of FREE-tier AI providers
 *
 * HOW IT WORKS
 * ------------
 * A provider here is ONLY activated if its API key exists in .env
 * (or, for key-less local providers like Ollama/LM Studio, if its
 * base URL is configured). No code changes needed to enable/disable:
 *
 *   GROQ_API_KEY=gsk_...        -> provider 'groq' is registered
 *   GEMINI_API_KEY=AIza...      -> provider 'gemini' is registered
 *   (variable commented out)    -> provider NOT registered
 *
 * ADD NEW PROVIDERS
 * -----------------
 * All providers below speak the OpenAI protocol (/chat/completions).
 * To add a brand new compatible provider, add an entry to
 * FREE_PROVIDER_TEMPLATES following the same shape and stop the server.
 *
 * FOR YOUR OWN SERVERS
 * --------------------
 * Use the CUSTOM_AI_* variables (see bottom of this file / .env.example).
 * Works with Ollama, LM Studio, vLLM, LiteLLM, OpenRouter-compatible
 * frontends, or any endpoint that speaks the OpenAI protocol.
 *
 * NOTE: model lists are curated for free/cheap tiers but availability
 * changes over time - verify on each provider's site.
 */

export const FREE_PROVIDER_TEMPLATES = [
  {
    id: 'groq',
    name: 'Groq',
    envKey: 'GROQ_API_KEY',
    baseURLKey: 'GROQ_BASE_URL',
    baseURL: 'https://api.groq.com/openai/v1',
    signup: 'https://console.groq.com/keys',
    note: 'Ultra-fast Llama inference. Generous free tier.',
    requiresKey: true,
    headers: {},
    models: [
      { upstream: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B Versatile', contextLength: 131072, maxOutputTokens: 8192, tier: 'free', capabilities: ['chat', 'reasoning', 'code'] },
      { upstream: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B Instant', contextLength: 131072, maxOutputTokens: 8192, tier: 'free', capabilities: ['chat', 'code'] },
    ],
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    envKey: 'GEMINI_API_KEY',
    baseURLKey: 'GEMINI_BASE_URL',
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai',
    signup: 'https://aistudio.google.com/app/apikey',
    note: 'Gemini free tier via the official OpenAI-compatible endpoint.',
    requiresKey: true,
    headers: {},
    models: [
      { upstream: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', contextLength: 1048576, maxOutputTokens: 8192, tier: 'free', capabilities: ['chat', 'reasoning', 'code', 'multimodal'] },
      { upstream: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite', contextLength: 1048576, maxOutputTokens: 8192, tier: 'free', capabilities: ['chat', 'code'] },
      { upstream: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', contextLength: 1048576, maxOutputTokens: 8192, tier: 'free', capabilities: ['chat', 'code', 'multimodal'] },
    ],
  },
  {
    id: 'cerebras',
    name: 'Cerebras',
    envKey: 'CEREBRAS_API_KEY',
    baseURLKey: 'CEREBRAS_BASE_URL',
    baseURL: 'https://api.cerebras.ai/v1',
    signup: 'https://cloud.cerebras.ai/',
    note: 'Extremely fast inference, free tier available.',
    requiresKey: true,
    headers: {},
    models: [
      { upstream: 'llama-3.3-70b', name: 'Llama 3.3 70B (Cerebras)', contextLength: 32768, maxOutputTokens: 8192, tier: 'free', capabilities: ['chat', 'reasoning', 'code'] },
      { upstream: 'llama3.1-8b', name: 'Llama 3.1 8B (Cerebras)', contextLength: 32768, maxOutputTokens: 8192, tier: 'free', capabilities: ['chat', 'code'] },
    ],
  },
  {
    id: 'mistral',
    name: 'Mistral AI',
    envKey: 'MISTRAL_API_KEY',
    baseURLKey: 'MISTRAL_BASE_URL',
    baseURL: 'https://api.mistral.ai/v1',
    signup: 'https://console.mistral.ai/api-keys',
    note: 'Free experimental tier (La Plateforme).',
    requiresKey: true,
    headers: {},
    models: [
      { upstream: 'mistral-small-latest', name: 'Mistral Small (Latest)', contextLength: 32768, maxOutputTokens: 8192, tier: 'free', capabilities: ['chat', 'code', 'multilingual'] },
      { upstream: 'open-mistral-nemo', name: 'Open Mistral Nemo', contextLength: 131072, maxOutputTokens: 8192, tier: 'free', capabilities: ['chat', 'code', 'multilingual'] },
    ],
  },
  {
    id: 'together',
    name: 'Together AI',
    envKey: 'TOGETHER_API_KEY',
    baseURLKey: 'TOGETHER_BASE_URL',
    baseURL: 'https://api.together.xyz/v1',
    signup: 'https://api.together.ai/settings/api-keys',
    note: 'Some models available at no cost (just $0.00).',
    requiresKey: true,
    headers: {},
    models: [
      { upstream: 'meta-llama/Llama-3.3-70B-Instruct-Turbo-Free', name: 'Llama 3.3 70B Turbo (Free)', contextLength: 131072, maxOutputTokens: 8192, tier: 'free', capabilities: ['chat', 'reasoning', 'code'] },
      { upstream: 'deepseek-ai/DeepSeek-R1-Distill-Llama-70B-free', name: 'DeepSeek R1 Distill 70B (Free)', contextLength: 131072, maxOutputTokens: 8192, tier: 'free', capabilities: ['chat', 'reasoning'] },
    ],
  },
  {
    id: 'huggingface',
    supportsTools: false,
    name: 'HuggingFace',
    envKey: 'HUGGINGFACE_API_KEY',
    baseURLKey: 'HUGGINGFACE_BASE_URL',
    baseURL: 'https://router.huggingface.co/v1',
    signup: 'https://huggingface.co/settings/tokens',
    note: 'Inference offers with free/cheap quota (token must have access).',
    requiresKey: true,
    headers: {},
    models: [
      { upstream: 'meta-llama/Meta-Llama-3-8B-Instruct', name: 'Llama 3 8B Instruct (HF)', contextLength: 8192, maxOutputTokens: 8192, tier: 'free', capabilities: ['chat', 'code'] },
    ],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    envKey: 'DEEPSEEK_API_KEY',
    baseURLKey: 'DEEPSEEK_BASE_URL',
    baseURL: 'https://api.deepseek.com/v1',
    signup: 'https://platform.deepseek.com/api_keys',
    note: 'Very cheap (not free) but solid reasoning.',
    requiresKey: true,
    headers: {},
    models: [
      { upstream: 'deepseek-chat', name: 'DeepSeek Chat', contextLength: 65536, maxOutputTokens: 8192, tier: 'low-cost', capabilities: ['chat', 'reasoning', 'code'] },
    ],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    envKey: 'OPENAI_API_KEY',
    baseURLKey: 'OPENAI_BASE_URL',
    baseURL: 'https://api.openai.com/v1',
    signup: 'https://platform.openai.com/api-keys',
    note: 'Paid. Set only if you have credits - acts as last-resort.',
    requiresKey: true,
    headers: {},
    models: [
      { upstream: 'gpt-4o-mini', name: 'GPT-4o Mini', contextLength: 128000, maxOutputTokens: 16384, tier: 'low-cost', capabilities: ['chat', 'reasoning', 'code', 'multimodal'] },
    ],
  },
  {
    id: 'ollama',
    supportsTools: false,
    name: 'Ollama (local)',
    envKey: 'OLLAMA_API_KEY', // not required; any local install works without a key
    baseURLKey: 'OLLAMA_BASE_URL',
    baseURL: 'http://localhost:11434/v1',
    signup: 'https://ollama.com/download',
    note: 'Local models, no key needed. Activate by setting OLLAMA_BASE_URL (or the default) and OLLAMA_MODELS.',
    requiresKey: false,
    headers: {},
    modelsEnvKey: 'OLLAMA_MODELS', // comma-separated upstream ids, e.g. "llama3.1:8b,qwen2.5:7b"
    models: [],
  },
  {
    id: 'lmstudio',
    supportsTools: false,
    name: 'LM Studio (local)',
    envKey: 'LMSTUDIO_API_KEY', // not required; LM Studio runs without a key
    baseURLKey: 'LMSTUDIO_BASE_URL',
    baseURL: 'http://localhost:1234/v1',
    signup: 'https://lmstudio.ai/',
    note: 'Local models via LM Studio, no key needed. Activate by setting LMSTUDIO_BASE_URL and LMSTUDIO_MODELS.',
    requiresKey: false,
    headers: {},
    modelsEnvKey: 'LMSTUDIO_MODELS',
    models: [],
  },
];

/**
 * Build the provider configs for every template that is properly
 * configured in the environment. Registers the provider catalog with
 * prefixed model ids (`<provider>/<model-upstream-id>`), keeping the
 * original upstream id in `upstreamId` so requests use the right name.
 */
export function buildCompatibleProviders() {
  const providers = {};

  for (const tpl of FREE_PROVIDER_TEMPLATES) {
    if (!isProviderActive(tpl)) continue;
    providers[tpl.id] = buildProviderEntry(tpl);
  }

  // ---- CUSTOM provider (your own server) ----
  const customBaseURL = process.env.CUSTOM_AI_BASE_URL;
  if (customBaseURL) {
    const customUpstreamIds = (process.env.CUSTOM_AI_MODELS || '')
      .split(',')
      .map(m => m.trim())
      .filter(Boolean);

    const models = {};
    for (const upstream of customUpstreamIds.length > 0 ? customUpstreamIds : ['custom-model']) {
      const id = `custom/${upstream}`;
      models[id] = {
        id,
        upstreamId: upstream,
        name: upstream,
        contextLength: parseInt(process.env.CUSTOM_AI_CONTEXT_LENGTH, 10) || 8192,
        maxOutputTokens: parseInt(process.env.CUSTOM_AI_MAX_TOKENS, 10) || 4096,
        pricing: { input: 0, output: 0 },
        tier: 'free',
        capabilities: ['chat', 'code'],
      };
    }

    providers.custom = {
      name: process.env.CUSTOM_AI_NAME || 'Custom AI',
      baseURL: customBaseURL,
      apiKey: process.env.CUSTOM_AI_API_KEY || '',
      headers: {},
      requiresKey: false,
      models,
    };
  }

  return providers;
}

function isProviderActive(tpl) {
  if (tpl.requiresKey === false) {
    // Key-less providers (Ollama, LM Studio, self-hosted):
    // active when the user configured a base URL or model list
    return Boolean(process.env[tpl.baseURLKey] || process.env[tpl.modelsEnvKey]);
  }
  const keyValue = process.env[tpl.envKey];
  return Boolean(keyValue && keyValue.trim() !== '');
}

function buildProviderEntry(tpl) {
  if (tpl.modelsEnvKey && process.env[tpl.modelsEnvKey]) {
    // Dynamic model list from env (Ollama, LM Studio, ...)
    const models = {};
    for (const upstream of process.env[tpl.modelsEnvKey].split(',').map(m => m.trim()).filter(Boolean)) {
      const id = `${tpl.id}/${upstream}`;
      models[id] = {
        id,
        upstreamId: upstream,
        name: upstream,
        contextLength: 8192,
        maxOutputTokens: 4096,
        pricing: { input: 0, output: 0 },
        tier: 'free',
        capabilities: ['chat', 'code'],
      };
    }
    return {
      name: tpl.name,
      baseURL: process.env[tpl.baseURLKey] || tpl.baseURL,
      apiKey: process.env[tpl.envKey] || '',
      headers: { ...tpl.headers },
      requiresKey: tpl.requiresKey,
      models,
    };
  }

  const models = {};
  for (const m of tpl.models) {
    const id = `${tpl.id}/${m.upstream}`;
    models[id] = {
      id,
      upstreamId: m.upstream,
      name: m.name,
      contextLength: m.contextLength,
      maxOutputTokens: m.maxOutputTokens,
      pricing: { input: 0, output: 0 },
      tier: m.tier,
      capabilities: m.capabilities,
    };
  }

  return {
    name: tpl.name,
    baseURL: process.env[tpl.baseURLKey] || tpl.baseURL,
    apiKey: process.env[tpl.envKey] || '',
    headers: { ...tpl.headers },
    requiresKey: tpl.requiresKey,
    models,
  };
}
