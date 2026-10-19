# Guia de Consumo da API — Para o Desenvolvimento de Clientes (Windows / Android)

> **Este documento é a "fonte da verdade" para uma IA (ou dev) construir um aplicativo cliente**
> que consome o Local AI Server. Primeiro Windows, depois Android nativo.
> A cada pergunta da IA sobre "como faço X?", a resposta deve vir daqui.

---

## 0. Visão geral (leia primeiro)

O Local AI Server é um **backend compatível com OpenAI** rodando em Node.js. O cliente é
"burro" por design: toda a inteligência (rotação de modelos, fallback, circuit breaker,
cache, rate limit) acontece **no servidor**. O cliente apenas:

1. **Escolhe o usuário** (avatar + senha opcional)
2. **Mantém localmente** a lista de conversas/projetos e sincroniza com o servidor
3. **Envia o chat** em formato OpenAI e renderiza a resposta (streaming ou não)
4. **Nunca gerencia modelos, nunca re-tenta em loop, nunca guarda chaves de API**

A stack do cliente NÃO importa para a API (WinUI/WPF/Console, OkHttp/Retrofit, coroutines...).
São endpoints HTTP + JSON puros.

---

## 1. Base URL e rede

| Onde o cliente está | Base URL |
|---|---|
| No próprio PC do servidor (Windows, primeira fase) | `http://localhost:3000` |
| Em outro PC/celular da mesma rede | `http://192.168.2.10:3000` |
| Internet (futuro) | via túnel/reverse proxy — não resolver agora |

- Regra: **armazene a Base URL como configurarão do app** (NÃO hardcode `localhost`), pois o
  mesmo build do Windows pode rodar na máquina do servidor ou em outro PC da rede.
- Clientes **nativos** (Windows/Android) não sofrem com CORS — ignore este assunto aqui.

## 2. Erros — formato padrão

Todo erro do servidor (HTTP != 200/201) tem esta forma. **Sempre leia `error.message`**:

```json
{ "error": { "message": "All models exhausted. Last error: ...", "type": "server_error", "code": "internal_error" } }
```

Tipos esperados: `invalid_request` (400), `auth_error` (401), `server_error` (500/internal).
Timeouts recomendados no cliente: **120s para chat** (rotação pode levar tempo), **30s para CRUD**, **150s para imagem**.

## 3. Login — usuários (avatar + senha)

### 3.1 Listar quem pode entrar (endpoint público)
```
GET /v1/users
→ { "users": [ { "id": "u_abc123", "name": "Ikão", "avatar": "data:image/...", "color": "#8a7ffc", "hasPassword": true, "createdAt": "..." }, ... ] }
```
- `avatar` pode ser string **vazia** → renderize iniciais sobre a cor `color`.
- `hasPassword: true` → exige senha; `false` → entra direto.
- **O "Convidado" não vem na lista** — o cliente cria o pseudo-usuário `{ id: "guest", name: "Convidado" }`.
  Convidado NÃO usa endpoints server-side (usa storage local do dispositivo — seção 5).

### 3.2 Validar senha (endpoint público)
```
POST /v1/users/verify
Body: { "id": "u_abc123", "password": "..." }
→ 200 { "success": true, "user": { ... } }                    // senha ok
→ 401 { "error": { "message": "Senha incorreta", "type": "auth_error" } }
```
- A mensagem de erro é sempre genérica — o servidor não revela se o usuário existe.
- **Sem token/sessão**: o servidor não emite JWT nem cookie. A "sessão" é client-side
  (regras na seção 4 e limitações de confiança na seção 8).

### 3.3 O que o cliente NÃO toca
`POST/PUT/DELETE /v1/users`, `/v1/config*` e `/v1/stats` são **administrativos, liberados
somente no PC do servidor (localhost)**. Na rede eles respondem **403** — o app cliente deve
esconder essas operações, nunca tratá-las como bug.

## 4. Sessão — como o cliente "lembra" do usuário

1. Guarde `me = { id, name, avatar, color, hasPassword }` no storage do dispositivo
   (Windows: arquivo/registry; Android: SharedPreferences).
2. Ao abrir o app: chame `GET /v1/users`; se o usuário salvo sumiu da lista → force login.
3. **Se o usuário tem senha, NUNCA entre direto do cache ao reabrir o app**: mostre a tela
   de senha e re-valide via `/v1/users/verify` (mesma regra do chat web: a sessão expira a
   cada cold start).
4. Trocar de usuário = abrir o seletor de novo. Não existe "logout" no servidor —
   apenas limpe o `me` local.

## 5. Conversas e projetos (armazenadas no servidor, por usuário)

### 5.1 Formato canônico de uma conversa
```json
{
  "id": "c1729356000000",
  "title": "Sem título",
  "projectId": "p_abc1234567",
  "updatedAt": "2026-10-19T14:00:00.000Z",
  "messages": [
    { "role": "user", "content": "texto simples" },
    { "role": "assistant", "content": "resposta em markdown" }
  ]
}
```
- O **cliente gera o id** da conversa: sugerido `'c' + Date.now()` (o chat web usa isso).
- ⚠️ Regex server-side para ids: `^[a-zA-Z0-9_]{1,40}$` — qualquer `/ . - :` dá 400
  ("id inválido"). Projetos/usuários são `p_`/`u_` + hex, já conformes.

### 5.2 Endpoints (todos recebem `userId` via querystring)
```
GET    /v1/conversations?userId={id}                 → { "conversations": [ ... ] }   (mais nova primeiro)
PUT    /v1/conversations/{convId}?userId={id}        body = objeto completo → { "success": true }
DELETE /v1/conversations/{convId}?userId={id}        → { "success": true }

GET    /v1/projects?userId={id}                      → { "projects": [ { "id": "p_...", "name": "...", "color": "#..." } ] }
POST   /v1/projects?userId={id}      body={name,color?}  → 201 { "success": true, "project": {...} }
PUT    /v1/projects/{pid}?userId={id} body={name?,color?} → { "success": true, "project": {...} }
DELETE /v1/projects/{pid}?userId={id}                    → { "success": true }
```

### 5.3 Regras de sincronização (tolerância a falha de rede)
- **PUT é upsert COMPLETO**: envie sempre o objeto inteiro da conversa (não diff parcial).
- Persista a conversa: (a) ao criar, (b) após cada resposta do assistant, (c) durante o
  streaming, no máximo 1x a cada 3s (throttle) + 1x no fim do stream.
- Falha de rede no PUT: **coloque em fila local e re-tente depois** — nunca bloqueie o chat.
- Máximo server-side: **100 conversas por usuário** (as mais novas vencem; avise o usuário).
- Projetos do **Convidado** (guest): existem só no device local, mesmo modelo de dados,
  salvos no storage do app.

## 6. Chat — o coração

### 6.1 Endpoint único
```
POST /v1/chat/completions
Headers: Content-Type: application/json
Body:
{
  "model": "auto",                    // "auto" (recomendado) ou um id de /v1/models
  "messages": [                       // histórico COMPLETO da conversa
    { "role": "system", "content": "Você é o assistente do app X" },
    { "role": "user", "content": "..." }
  ],
  "stream": true,                     // RECOMENDADO sempre true (UX)
  "temperature": 0.7,                 // opcional
  "max_tokens": 1024                  // opcional
}
```
- Envie o histórico completo a cada chamada (o servidor reconstrói o contexto se trocar de
  modelo; internamente usa as últimas ~20 mensagens).
- Nos itens de mensagem, por enquanto use apenas `{role, content}` — nada de tool_calls.

### 6.2 Streaming (SSE) — formato exato
O servidor responde `200` com `Content-Type: text/event-stream` e envia blocos:
```
data: {"id":"...","object":"chat.completion.chunk","model":"...","provider":"openrouter","choices":[{"index":0,"delta":{"content":"Oi"},"finish_reason":null}]}

data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}

data: [DONE]
```
Regras de parse no cliente:
- Blocos separados por `\n\n`. **Chunks chegam fragmentados ao acaso**: acumule em buffer e
  processe apenas eventos completos.
- **Concatene `delta.content`** de todos os eventos para montar a mensagem completa.
- `data: [DONE]` encerra; `finish_reason: "stop"` também sinaliza fim.
- Pode chegar um evento de erro dentro do stream: `data: {"error":{"message":"..."}}` —
  detecte e mostre o erro (não é conteúdo).
- O **primeiro** evento pode demorar até ~90s quando o servidor está rotacionando de
  modelo. Mostre estado "pensando..." até receber o primeiro chunk.

### 6.3 Resposta sem streaming (útil p/ resumos e títulos automáticos)
```json
{
  "id": "...", "model": "nvidia/nemotron-...", "provider": "openrouter",
  "cached": true,
  "choices": [ { "message": { "role": "assistant", "content": "..." }, "finish_reason": "stop" } ],
  "usage": { "prompt_tokens": 10, "completion_tokens": 24, "total_tokens": 34 }
}
```
- `cached: true` → resposta veio do cache do servidor (igual à enviada nos últimos 60s);
  renderize normalmente, pode exibir badge "(cache)".
- Defesa: se vier `error` no body, mostre `error.message` — nunca exiba content vazio.

### 6.4 Política de erro e retry do cliente (importante!)
- `500 "All models exhausted..."` → mensagem amigável "Servidor sem modelos ativos agora"
  + botão "Tentar novamente". **NÃO re-tente automaticamente em loop** — martelada piora o
  rate limit dos provedores gratuitos.
- Timeout de rede → cancele (AbortController/CancellationToken) e informe.
- rotação/fallback/circuit breaker/retry **já acontecem no servidor** — o cliente não duplica.

### 6.5 Listar modelos (seletor opcional no app)
```
GET /v1/models
→ { "object": "list", "data": [ { "id": "nvidia/nemotron-...", "name": "...", "tier": "..." }, ... ] }
```
- Cacheie no cliente por ~5 min. `"auto"` é o default seguro sempre disponível.

## 7. Geração de imagens (grátis, sem chave)
```
POST /v1/images/generate
Body: { "prompt": "um tucano na floresta, estilo aquarela", "width": 1024, "height": 1024 }
→ 200 { "success": true, "url": "/files/images/img_xyz123.png", "prompt": "...", "seed": 123, "width": 1024, "height": 1024, "bytes": 123456 }
→ 502 { "error": { "message": "Falha ao gerar imagem: ...", "type": "server_error" } }
```
- ⚠️ `url` é **RELATIVA** → exiba como `BASE_URL + url` (ex.: `http://192.168.2.10:3000/files/images/img_abc.jpg`).
- width/height aceitos: 256 a 1536 (clampado no servidor). Presets: quadrado 1024×1024,
  paisagem 1280×720, retrato 720×1280.
- Timeout recomendado: **150s** (o upstream Pollinations às vezes demora). Spinner.
- Para o histórico: baixe a imagem e cacheie no device — não confie na URL para sempre.

## 8. Segurança do cliente (regras duras)

1. **Nada sensível hardcoded**: Base URL em configuração; o app NÃO embute chaves de API
   (elas moram no `.env` do servidor — a API pública não exige chave).
2. **Modelo de confiança**: os endpoints de conversas/projetos recebem `userId` sem token,
   por design LAN confiável. Isso significa que alguém na mesma rede que descobrir o id
   poderia ler as conversas. Aceito para rede doméstica/empresa pequena — **não exponha o
   servidor à internet** sem adicionar autenticação (roadmap).
3. Senha via `/v1/users/verify` trafega em HTTP simples dentro da LAN — rede confiável.
   Se um dia houver HTTPS via proxy, aí sim TLS/pinning no Android.
4. **Nunca** consumes os endpoints admin (`/v1/config*`, CRUD `/v1/users`, `/v1/stats`).
5. Cache local (imagens, conversas) é espelho — **a fonte da verdade é o servidor**.

## 9. Diagnóstico (aba "Sobre"/debug do app)

```
GET /health                → status do servidor + providers ativos
GET /v1/models             → modelos disponíveis agora
GET /v1/rotation/status    → estado de cada modelo (disponível / rate-limited / circuit aberto)
GET /v1/stats              → requisições, taxa de ok, latência média, tokens, cache hits
```
Uma aba de diagnóstico mostrando `/health` + histórico local de erros é suficiente.

## 10. Roteiro de implementação (seguência sugerida)

**Fase 1 — Windows (MVP)**
1. Configuração de Base URL + tela "Quem está usando?" (avatares + convidado + senha)
2. Lista de conversas (sidebar) + projetos (chips de filtro) — seção 5
3. Chat com streaming — seção 6.2 (render markdown básico: **b**, *i*, `código`, listas, fenced code)
4. Ação "gerar imagem" — seção 7, exibe inline na conversa
5. Diagnóstico — seção 9

**Fase 2 — Android nativo (Kotlin)**
- Os endpoints são os mesmos; mudam só as práticas de plataforma:
  - SSE: **OkHttp `EventSource`** (ou Retrofit `@Streaming` + leitura de linhas); cuidado com reconexão automática (não duplicar eventos)
  - Storage: SharedPreferences (sessão) + Room (cache offline de conversas)
  - Markdown: Markwon; imagens: Coil
  - IDs: mesmos formatos da seção 5.1

## 11. Apêndice — "papel de sistema" pronto para colar na IA do projeto cliente

```
Você é a IA responsável por desenvolver o APLICATIVO CLIENTE do "Local AI Server".
Regras fundamentais:

1. Você é o CLIENTE: nunca implemente rotação de modelos, cache, circuit breaker,
   fallback ou rate limit — o SERVIDOR já faz tudo isso.

2. Base URL é configurável, nunca hardcoded. Dev local: http://localhost:3000.
   Rede: http://192.168.2.10:3000 (ou o IP atual do servidor).

3. Conversa segue o formato canônico da seção 5.1: { id, title, projectId,
   updatedAt, messages }. IDs possuem SOMENTE [a-zA-Z0-9_] (máx 40 chars).
   Sugerido: id da conversa = 'c' + Date.now() (timestamp em milissegundos).

4. Chat: POST /v1/chat/completions com stream:true; histórico completo em
   messages (apenas role/content). Parse SSE conforme seção 6.2 (buffer, [DONE],
   eventos de erro no stream). Timeout 120s. Não re-tentar automaticamente em 500.

5. Usuários: GET /v1/users lista os avatares; POST /v1/users/verify valida senha
   (401 = incorreta). Convidado = { id:"guest" } usa storage local e NUNCA envia
   userId aos endpoints server-side. Sessão expira a cada reabertura do app
   se o usuário tiver senha.

6. Imagens: POST /v1/images/generate (timeout 150s). A url retornada é RELATIVA;
   SEMPRE prefixe com a Base URL antes de exibir/baixar.

7. NUNCA use endpoints admin (/v1/config*, POST/PUT/DELETE /v1/users, /v1/stats).
   Se algum dia precisar de Administração, será outra aplicação rodando no servidor.

8. Toda chamada é async; UI nunca bloqueada; todo erro é exibido usando
   error.message (formato da seção 2). Conversas persistem com upsert completo
   via PUT, com retry local em falha de rede.

Guia completo de referência: docs/CLIENT_API_GUIDE.md no repositório do servidor.
```

— fim do guia —
