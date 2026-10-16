# Local AI Server

Um servidor de IA local que roda na sua rede interna, gerencia múltiplos provedores (OpenRouter, NVIDIA), faz rotação automática entre modelos gratuitos quando atinge rate limits, preserva o contexto/raciocínio ao trocar de modelo, e expõe uma API compatível com OpenAI para uso no VSCode (Continue, Cline, CodeGPT, etc.).

## 🚀 Funcionalidades

- **Múltiplos Provedores**: OpenRouter + NVIDIA (Nemotron, Llama, Gemma, Mistral)
- **Rotação Automática**: Troca de modelo ao atingir rate limit sem perder o raciocínio
- **Preservação de Contexto**: Mantém histórico e resumo da conversa ao trocar modelos
- **API OpenAI Compatível**: Funciona com Continue, Cline, CodeGPT, Cursor, etc.
- **Modelos Gratuitos Prioritários**: Usa modelos free tier primeiro
- **Deploy Nativo**: Node.js puro, sem Docker necessário
- **Monitoramento**: Endpoints de health check e status de rotação

## 📋 Pré-requisitos

- Node.js 18+ (recomendado 20+)
- npm ou pnpm
- Chaves de API:
  - [OpenRouter](https://openrouter.ai/keys) - para acesso a 100+ modelos
  - [NVIDIA](https://build.nvidia.com/) - para Nemotron e modelos NVIDIA

## 🛠 Instalação

```bash
# Clone ou entre no diretório
cd D:\LOCALIA

# Instale dependências
npm install

# Configure suas chaves de API
cp .env.example .env
# Edite .env com suas chaves
```

## ⚡ Início Rápido (5 minutos)

1. **Instale Node.js 18+**: https://nodejs.org/
2. **Instale as dependências**:
   ```bash
   npm install
   ```
3. **Configure suas chaves**:
   ```bash
   copy .env.example .env
   ```
   Edite o `.env` e preencha `OPENROUTER_API_KEY` e `NVIDIA_API_KEY`.
4. **Inicie o servidor**:
   ```bash
   npm start
   ```
   (No Windows, dê dois cliques em `Iniciar_Servidor.bat` — ele instala dependências e cria o `.env` automaticamente.)
5. **Teste tudo**:
   ```bash
   node scripts/test_server.js
   ```
   Testa `/health`, `/v1/models` e um chat completo em `model: "auto"`.

> **Na rede local**: descubra o IP da máquina com `ipconfig` e use `http://SEU_IP:3000/v1` nos clientes de outros PCs.

## ⚙️ Configuração

Edite o arquivo `.env`:

```env
# OpenRouter (obrigatório para maioria dos modelos)
OPENROUTER_API_KEY=sk-or-v1-xxxxxxxxxxxxx

# NVIDIA (obrigatório para Nemotron, Llama 405B, etc.)
NVIDIA_API_KEY=nvapi-xxxxxxxxxxxxx

# Estratégia de rotação
ROTATION_STRATEGY=rate-limit  # rate-limit | round-robin | priority

# Modelos gratuitos prioritários (ordem de preferência)
FREE_MODELS_PRIORITY=meta-llama/llama-3.1-8b-instruct:free,google/gemma-2-9b-it:free,mistralai/mistral-7b-instruct:free,nvidia/nemotron-3-ultra

# Preservar contexto ao trocar modelos
PRESERVE_CONTEXT=true
MAX_CONTEXT_MESSAGES=20
```

## ▶️ Executando

```bash
# Desenvolvimento (com auto-reload)
npm run dev

# Produção
npm start
```

O servidor estará disponível em:
- **API**: `http://localhost:3000/v1/chat/completions`
- **Models**: `http://localhost:3000/v1/models`
- **Health**: `http://localhost:3000/health`
- **Status Rotação**: `http://localhost:3000/v1/rotation/status`

## 🔌 Configuração no VSCode

### Continue (Recomendado)
Adicione ao `~/.continue/config.json`:

```json
{
  "models": [
    {
      "title": "Local AI Server",
      "provider": "openai",
      "model": "auto",
      "apiBase": "http://SEU_IP:3000/v1",
      "apiKey": "local-ai-server",
      "contextLength": 128000
    }
  ],
  "tabAutocompleteModel": {
    "title": "Local AI Server",
    "provider": "openai",
    "model": "auto",
    "apiBase": "http://SEU_IP:3000/v1",
    "apiKey": "local-ai-server"
  }
}
```

### Cline
Configure em Settings > Cline > API Provider:
- **Provider**: OpenAI Compatible
- **Base URL**: `http://SEU_IP:3000/v1`
- **API Key**: `local-ai-server` (qualquer valor)
- **Model**: `auto` (para rotação automática)

### CodeGPT
Settings > CodeGPT > API Providers > Add Custom:
- **Name**: Local AI Server
- **Base URL**: `http://SEU_IP:3000/v1`
- **API Key**: `local-ai-server`
- **Models**: Selecione "auto" ou modelo específico

### Cursor
Settings > Models > Add Model:
- **Name**: Local AI Server
- **Type**: OpenAI Compatible
- **Base URL**: `http://SEU_IP:3000/v1`
- **API Key**: `local-ai-server`

> **Nota**: Substitua `SEU_IP` pelo IP da máquina na rede local (ex: `192.168.1.100`). Use `localhost` se for na mesma máquina.

## 📡 Endpoints da API

### Chat Completions
```bash
POST /v1/chat/completions
Content-Type: Application/JSON
Authorization: Bearer local-ai-server

{
  "model": "auto",
  "messages": [
    {"role": "user", "content": "Escreva uma função em Python para fibonacci"}
  ],
  "stream": true,
  "temperature": 0.7
}
```

**Parâmetros especiais**:
- `model: "auto"` - Seleciona automaticamente o melhor modelo disponível
- `X-Conversation-ID` header - Para preservar contexto entre requisições

### Listar Modelos
```bash
GET /v1/models
```

### Status de Rotação
```bash
GET /v1/rotation/status
```

### Definir Modelo Manual
```bash
POST /v1/rotation/model
Content-Type: Application/JSON

{"model": "nvidia/nemotron-3-ultra"}
```

### Resetar Estado de Modelo
```bash
POST /v1/rotation/reset
Content-Type: Application/JSON

{"model": "meta-llama/llama-3.1-8b-instruct:free"}
```

## 🔄 Como Funciona a Rotação

1. **Requisição chega** → Sistema verifica modelo atual
2. **Tenta completar** → Se sucesso, retorna resposta
3. **Se erro 429 (rate limit)** → Marca modelo como rate limited
4. **Seleciona próximo** → Pega próximo modelo disponível da lista prioritária
5. **Preserva contexto** → Injeta resumo da conversa no novo modelo
6. **Re-tenta** → Continua até sucesso ou esgotar modelos

### Estratégias de Rotação

| Estratégia | Comportamento |
|------------|---------------|
| `rate-limit` | Troca só quando atinge rate limit (padrão) |
| `round-robin` | Distribui requisições entre modelos |
| `priority` | Usa ordem de prioridade definida em `FREE_MODELS_PRIORITY` |

## 🧠 Preservação de Contexto

Ao trocar de modelo, o servidor:
1. Mantém as últimas N mensagens (configurável via `MAX_CONTEXT_MESSAGES`)
2. Cria um resumo da conversa anterior
3. Injeta como system message no novo modelo:
   ```
   [Context from previous model (model-name):
   User: Pergunta anterior
   Assistant: Resposta anterior
   
   Continue a conversa naturalmente, mantendo o raciocínio...]
   ```

## 📊 Modelos Disponíveis

### OpenRouter (Gratuitos)
- `meta-llama/llama-3.1-8b-instruct:free` - 128K context
- `google/gemma-2-9b-it:free` - 8K context
- `mistralai/mistral-7b-instruct:free` - 32K context
- `microsoft/phi-3-mini-128k-instruct:free` - 128K context
- `qwen/qwen-2.5-7b-instruct:free` - 32K context

### NVIDIA (Gratuitos)
- `nvidia/nemotron-3-ultra` - 128K context
- `nvidia/nemotron-3-ultra-550b-a55b` - 128K context
- `meta/llama-3.1-405b-instruct` - 128K context
- `meta/llama-3.1-70b-instruct` - 128K context
- `meta/llama-3.1-8b-instruct` - 128K context
- `google/gemma-2-27b-it` - 8K context
- `mistralai/mistral-large` - 128K context

## 🐳 Docker (Opcional)

```bash
# Com docker-compose (recomendado)
docker compose up -d

# Ou manualmente
docker build -t local-ai-server .
docker run -d -p 3000:3000 --env-file .env local-ai-server
```

## 🔧 Desenvolvimento

```bash
# Ver logs detalhados
LOG_LEVEL=debug npm run dev

# Testar rotação manual
curl -X POST http://localhost:3000/v1/rotation/model \
  -H "Content-Type: Application/JSON" \
  -d '{"model": "nvidia/nemotron-3-ultra"}'

# Ver status
curl http://localhost:3000/v1/rotation/status

# Suite de testes (health + models + chat)
node scripts/test_server.js [host]
```

## 📝 Estrutura do Projeto

```
local-ai-server/
├── src/
│   ├── index.js               # Entrada (carrega dotenv e inicia servidor)
│   ├── server.js              # Servidor Express principal
│   ├── config/
│   │   └── providers.js       # Configuração de modelos e provedores
│   ├── core/
│   │   ├── ModelRotationManager.js  # Lógica de rotação
│   │   └── ChatCompletionHandler.js # Orquestração de chat
│   └── providers/
│       ├── BaseProviderClient.js    # Classe base
│       ├── OpenRouterClient.js      # Cliente OpenRouter
│       ├── NVIDIAClient.js          # Cliente NVIDIA
│       └── ProviderFactory.js       # Factory de provedores
├── scripts/
│   └── test_server.js         # Testa health, models e chat
├── .env.example               # Exemplo de configuração
├── .gitignore                 # Ignora .env e node_modules
├── Dockerfile                 # Deploy em Docker
├── docker-compose.yml         # Subida com 1 comando
├── Iniciar_Servidor.bat       # Início com 2 cliques (Windows)
├── package.json
├── LICENSE                    # MIT
└── README.md
```

## 🤝 Contribuindo

1. Fork o projeto
2. Crie uma branch (`git checkout -b feature/nova-funcionalidade`)
3. Commit suas mudanças (`git commit -am 'Adiciona nova funcionalidade'`)
4. Push para a branch (`git push origin feature/nova-funcionalidade`)
5. Abra um Pull Request

## 📄 Licença

MIT License - veja [LICENSE](LICENSE) para detalhes.

## 🙏 Agradecimentos

- [OpenRouter](https://openrouter.ai/) - Acesso unificado a modelos
- [NVIDIA](https://build.nvidia.com/) - Modelos Nemotron e hospedagem gratuita
- Comunidade open-source pelos modelos utilizados

---

**Dica**: Para usar na rede local, descubra seu IP com `ipconfig` (Windows) ou `ifconfig` (Linux/Mac) e configure o VSCode para usar `http://SEU_IP:3000/v1`.