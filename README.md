# Local AI Server

Um servidor de IA local que roda na sua rede interna, gerencia múltiplos provedores (OpenRouter, NVIDIA), faz rotação automática entre modelos gratuitos quando atinge rate limits, preserva o contexto/raciocínio ao trocar de modelo, e expõe uma API compatível com OpenAI para uso no VSCode (Continue, Cline, CodeGPT, etc.).

## 🚀 Funcionalidades

- **Múltiplos Provedores**: OpenRouter + NVIDIA + Groq, Gemini, Cerebras, Mistral, Together, HuggingFace, DeepSeek, OpenAI, Ollama, LM Studio e servidor próprio
- **Rotação Automática**: Troca de modelo ao atingir rate limit sem perder o raciocínio
- **Preservação de Contexto**: Mantém histórico e resumo da conversa ao trocar modelos
- **Chat pelo navegador**: interface web pronta, servida pelo próprio servidor
- **Usuários com avatar** (ideal para empresas): conversas separadas por pessoa/setor, salvas no servidor
- **Projetos**: agrupe conversas por setor/cliente/assunto (por usuário, salvos no servidor)
- **Criação com IA**: 🖼️ imagens (grátis, sem chave), 📄 documentos (.doc/.html/.md + PDF) e 📊 apresentações de slides
- **Painel de configuração na web**: adicione/remova APIs e chaves sem editar arquivo nenhum — ativa na hora
- **API OpenAI Compatível**: Funciona com Continue, Cline, CodeGPT, Cursor, etc.
- **Modelos Gratuitos Prioritários**: Usa modelos free tier primeiro
- **Deploy Nativo**: Node.js puro, sem Docker necessário
- **Monitoramento**: Endpoints de health check e status de rotação

## 📋 Pré-requisitos

- Node.js 18+ (recomendado 20+)
- npm ou pnpm
- Chaves de API (opcional — veja lista de provedores abaixo):
  - [OpenRouter](https://openrouter.ai/keys) - para acesso a 100+ modelos
  - [NVIDIA](https://build.nvidia.com/) - para Nemotron e modelos NVIDIA

## 💾 Versão Portátil (pendrive)

Não quer instalar Node.js? Gere um pacote que roda em **qualquer Windows com duplo clique**:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\build_portable.ps1
```

Isso cria `portable\LocalAIServer-Portable\` (~95 MB, já inclui o `node.exe`):

```
LocalAIServer-Portable\
├─ Iniciar.bat        ← duplo-clique e pronto
├─ app\               código do servidor + chat web
├─ app\data\          usuários, conversas e imagens (ficam no pendrive!)
├─ app\.env           chaves de API (do pendrive, não do PC)
└─ node\node.exe      runtime embutido — PC alvo não precisa de nada
```

- **Zero instalação** no PC hospedeiro: cole a pasta no pendrive e execute `Iniciar.bat`
- Primeiro boot sem chaves? Configure pelo painel ⚙️ do chat (localhost) ou edite `app\.env`
- Use `-IncludeEnv` no script se quiser copiar seu `.env` atual (⚠️ a chave vai junto)
- ⚠️ Segurança: `app\data\` (conversas/usuários) e `app\.env` (chaves) viajam no pendrive —
  remova o pendrive só depois de fechar o servidor (CTRL+C) e prefira BitLocker To Go
- Opções: `powershell -File scripts\build_portable.ps1 -Destination D:\MeuStick -IncludeEnv`

## 🛠 Instalação

```bash
# Entre na pasta do projeto
cd local-ai-server

# Instale dependências
npm install

# Configure suas chaves de API
cp .env.example .env
# Edite .env com suas chaves
```

## 🌐 Chat pelo navegador (incluído!)

O servidor entrega a própria interface de chat. Abra no navegador:

```
http://localhost:3000          (no PC do servidor)
http://192.168.2.10:3000       (de qualquer PC / celular / tablet da rede)
```

- Conversas **salvas no servidor, separadas por usuário** (veja a seção 👥 abaixo)
- Resposta em **streaming** palavra por palavra (SSE, mesmo protocolo da API)
- Markdown + blocos de código com botão copiar
- Painel de conversas na lateral, botão de parar resposta
- Sem instalar nada — só um navegador

## ⚙️ Painel de configuração de APIs (na web)

Clique no **⚙️** no topo do chat (ou via API em `GET /v1/config`). Lá você:

- Vê todas as **13 APIs** prontas (OpenRouter, NVIDIA, Groq, Gemini, Cerebras, Mistral, Together, HuggingFace, DeepSeek, OpenAI, Ollama, LM Studio + seu próprio servidor) com status **✅ ATIVA / INATIVA**
- Preenche a chave de qualquer API e clica **Salvar** → entra na rotação **na hora**, sem reiniciar
- Vê o link para pegar a chave de cada provedor
- Limpa a chave de uma API para desativá-la

Segurança: por padrão a configuração **só pode ser alterada a partir do próprio servidor (`localhost`)** — outros PCs da rede só conversam, não mexem em chaves. Para liberar de outros PCs da rede, sete `ALLOW_REMOTE_CONFIG=true`.

> As chaves são salvas no arquivo `.env` do servidor (nunca no navegador) e são apresentadas **mascaradas** (`gsk_a****f9z2`) na tela.

## 👥 Usuários (para empresas — conversas separadas por setor)

Perfeito para uso corporativo: cada pessoa entra no chat clicando no próprio avatar, e **as conversas ficam separadas por usuário — salvas no servidor**, não no navegador.

1. No PC do servidor, abra o chat e clique **⚙️ → aba 👥 Usuários**
2. Cadastre os usuários (nome + foto opcional): "Setor Financeiro", "RH", "Suporte"...
3. **Senha opcional por usuário**: defina no cadastro ou depois (aba 👥 → campo senha). Quem tiver senha vê 🔒 no avatar e precisa digitá-la para entrar. As senhas ficam guardadas como **hash no servidor** (nunca em texto puro, nunca expostas). Recarregar a página pede a senha de novo.
4. De qualquer PC/celular da rede, quem abrir `http://SEU_IP:3000` vê a tela **"Quem está usando?"** com os avatares
5. Cada usuário clica no próprio perfil → conversas próprias, isoladas das outras

- As conversas ficam salvas na pasta `data/` do servidor (nunca sobe para o GitHub) — trocar de máquina não perde o histórico.
- É possível ativar/remover/editar usuários e apagar as conversas de alguém a qualquer momento.
- Modo **Convidado** disponível para acessos avulsos (neste caso as conversas ficam só no navegador, como antes).

## 🛠️ Criação com IA (na barra ➕ do campo de mensagem)

### 🖼️ Imagens
- Geração de imagem **gratuita e sem API key** (Pollinations.ai)
- Tamanhos: quadrado 1024×1024, paisagem 1280×720, retrato 720×1280
- A imagem aparece na conversa, pode ser **baixada** e **regenerada** (nova variação)
- Arquivos ficam em `data/images/` do servidor

### 📄 Documentos
1. Clique **📄 Documento**, escreva o tema e envie
2. A IA escreve o documento completo em Markdown
3. Nos botões abaixo da resposta: **⬇️ .doc (Word)**, ⬇️ .html, ⬇️ .md e 🖨 **Imprimir/PDF** (via impressão do navegador)

### 📊 Apresentações
1. Clique **📊 Apresentação**, escreva o tema e envie
2. A IA retorna slide a slide
3. Botões: **▶️ Apresentar** (tela cheia, navega com ← →, fecha com ESC), ⬇️ **deck .html** (apresentação autônoma que abre em qualquer navegador) e ⬇️ .md

### 📁 Projetos
- Chips na lateral: crie projetos ("Cliente X", "Financeiro"...) e filte conversas por eles
- Nova conversa entra no projeto selecionado; para mover, use o seletor de projeto junto ao caixa de mensagem
- Convidados também têm projetos (versão local no navegador)

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
   Testa `/health`, chat web, painel de configuração, `/v1/models` e um chat completo em `model: "auto"`.

> 💡 **Sem chaves?** Você pode ativar o **Ollama** (modelos locais, sem API key) pelo próprio painel ⚙️ do chat — preencha `OLLAMA_MODELS=llama3.1:8b` e a IA roda no seu PC.

> **Na rede local**: descubra o IP da máquina com `ipconfig` e use `http://SEU_IP:3000` (chat no navegador) ou `http://SEU_IP:3000/v1` (API para VSCode etc.) nos clientes de outros PCs.

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

## 🤖 Provedores Extras Prontos (auto-ativados)

O servidor já vem com uma lista de provedores **OpenAI-compatíveis**. Um provedor só é ativado quando a chave dele existe no `.env` — comentado/sem chave = desativado. Sem alterar código:

| Provedor | Variável no `.env` | Free? | Onde pegar a chave |
|---|---|---|---|
| **Groq** (Llama ultra-rápido) | `GROQ_API_KEY` | ✅ generoso | console.groq.com/keys |
| **Google Gemini** (OpenAI endpoint) | `GEMINI_API_KEY` | ✅ | aistudio.google.com/app/apikey |
| **Cerebras** (inferência muito rápida) | `CEREBRAS_API_KEY` | ✅ | cloud.cerebras.ai |
| **Mistral** | `MISTRAL_API_KEY` | ✅ experimental | console.mistral.ai |
| **Together AI** | `TOGETHER_API_KEY` | ✅ modelos a $0 | api.together.ai |
| **HuggingFace Router** | `HUGGINGFACE_API_KEY` | ✅ limitado | huggingface.co/settings/tokens |
| **DeepSeek** | `DEEPSEEK_API_KEY` | 💲 barato | platform.deepseek.com |
| **OpenAI** | `OPENAI_API_KEY` | 💲 pago (reserva final) | platform.openai.com |
| **Ollama** (local, sem chave!) | `OLLAMA_BASE_URL` + `OLLAMA_MODELS` | ✅ grátis | ollama.com/download |
| **LM Studio** (local, sem chave!) | `LMSTUDIO_BASE_URL` + `LMSTUDIO_MODELS` | ✅ grátis | lmstudio.ai |
| **Seu próprio servidor** ✨ | `CUSTOM_AI_BASE_URL` + `CUSTOM_AI_MODELS` | — | qualquer endpoint OpenAI-compatible |

Como funciona:

```env
# Desativado (comentado)
#GROQ_API_KEY=

# Ativado — na próxima inicialização o log mostra:
# [ProviderFactory] Initialized 4 providers: openrouter, nvidia, groq, ...
GROQ_API_KEY=gsk_xxxxx
```

Todos os modelos dos provedores ativados entram automaticamente na rotação do `model: "auto"` (preservando contexto ao trocar). Para dar prioridade a algum, adicione o id prefixado em `FREE_MODELS_PRIORITY` (ex: `groq/llama-3.3-70b-versatile`).

Para o **Ollama**: instale, rode `ollama serve` e preencha por exemplo `OLLAMA_MODELS=llama3.1:8b` — os modelos locais entram na rotação como fallback gratuito, direto do seu PC.

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

### Estatísticas
```bash
GET /v1/stats
```
Retorna: resumo (requisições, taxa ok, latência média, tokens, cache), uso por modelo e as últimas 50 requisições. Formatado também na aba 📊 do painel ⚙️.

### Validar Chave (sem salvar)
```bash
POST /v1/config/test
Content-Type: Application/JSON

{"provider": "groq", "values": {"GROQ_API_KEY": "gsk_..."}}
```
Testa a chave ao vivo no provedor (nunca salva, nunca retorna a chave). Botão **🔌 Testar** nos cards de API do painel ⚙️. Restrito a localhost como o resto do painel.

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

## 🩺 Confiabilidade (Circuit Breaker, Cache, Tools)

- **⚡ Circuit breaker** — depois de `CIRCUIT_THRESHOLD` falhas consecutivas (padrão 3), o modelo fica fora de rotação por `CIRCUIT_COOLDOWN_MS`. Depois do cooldown volta a testar (half-open). Se TODOS os circuitos abrirem, o sistema faz uma sondagem ignorando os circuitos (evita travar tudo).
- **💨 Cache de respostas idênticas** — mesmas mensagens + modelo + temperatura dentro de `CACHE_TTL_SECONDS` (60s padrão) retorna na hora (`"cached": true`), sem gastar a API. Desative com `ENABLE_CACHE=false`. *(Cache semântico por similaridade exige embeddings — planejado via Ollama.)*
- **🛠 Tool calling normalizado** — provedores sem suporte a `tools` (HuggingFace, Ollama, LM Studio) recebem a requisição sem tools automaticamente; se um provedor recusar tools em tempo real, o servidor remove e tenta de novo no mesmo modelo antes de rotacionar.
- **🛡 Corpo de erro com HTTP 200** — alguns upstreams retornam 200 com `error` embutido; o motor detecta e rotaciona como falha real (e não guarda no cache).

## 📊 Estatísticas (Observabilidade)

- Endpoint `GET /v1/stats`: total de requisições, taxa de ok, **latência média real**, tokens in/out (do `usage` dos provedores), hits de cache, circuitos abertos e as últimas 50 requisições (modelo, tentativas, erro).
- Aba **📊 Estatísticas** no painel ⚙️ do chat web mostra resumo em cards + tabelas por modelo e por requisição.
- Métricas ficam em memória (recomeçam quando o servidor reinicia).

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

Exemplos (a lista real depende das APIs ativadas — veja `GET /v1/models`):

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
│   ├── server.js              # Servidor Express + rotas API + config
│   ├── config/
│   │   ├── providers.js       # Catálogo de modelos e provedores
│   │   ├── freeProviders.js   # ✨ Lista pronta de provedores gratuitos (auto-ativação)
│   │   ├── envManager.js      # ✨ Le/grava .env (painel de configuração web)
│   │   └── userStore.js       # ✨ Usuários + conversas/projetos por usuário (pasta data/)
│   ├── core/
│   │   ├── ModelRotationManager.js  # Lógica de rotação
│   │   └── ChatCompletionHandler.js # Orquestração de chat
│   └── providers/
│       ├── BaseProviderClient.js    # Classe base
│       ├── OpenAICompatibleClient.js # ✨ Cliente genérico OpenAI-compatible
│       ├── OpenRouterClient.js      # Cliente OpenRouter
│       ├── NVIDIAClient.js          # Cliente NVIDIA
│       └── ProviderFactory.js       # Factory de provedores
├── public/
│   └── index.html             # ✨ Chat web + configuração de APIs + usuários (servido pelo servidor)
├── scripts/
│   └── test_server.js         # Testa health, web chat, config, users, models e chat
├── data/                      # Gerada em tempo de execução (usuários e conversas) — nunca publique
├── .env.example               # Exemplo de configuração
├── .gitignore                 # Ignora .env, node_modules e data/
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