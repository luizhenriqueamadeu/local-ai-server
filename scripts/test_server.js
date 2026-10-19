/**
 * Teste rápido do Local AI Server
 * Uso: node scripts/test_server.js [host]
 * Ex:  node scripts/test_server.js localhost
 *      node scripts/test_server.js 192.168.2.10
 */
const host = process.argv[2] || 'localhost';
const base = `http://${host}:3000`;

function ok(label, cond, extra = '') {
  console.log(`${cond ? '✅' : '❌'} ${label}${extra ? ' — ' + extra : ''}`);
  return cond;
}

async function main() {
  let failures = 0;

  // 1. Health check
  try {
    const r = await fetch(`${base}/health`);
    const j = await r.json();
    ok('GET /health', r.status === 200 && j.status === 'healthy',
      `providers: ${(j.providers || []).join(', ')}`);
    if (r.status !== 200) failures++;
  } catch (e) {
    console.log(`❌ GET /health — servidor não respondeu (${e.message})`);
    console.log('   → O servidor está rodando? Execute: node src/index.js');
    process.exit(1);
  }

  // 2. Página web (chat)
  try {
    const r = await fetch(base + '/');
    const t = await r.text();
    const isPage = r.status === 200 && t.includes('Local AI Server') && t.includes('<script');
    ok('GET / (web chat)', isPage, isPage ? 'página HTML servida' : t.slice(0, 80));
    if (!isPage) failures++;
  } catch (e) {
    ok('GET / (web chat)', false, e.message);
    failures++;
  }

  // 2b. Painel de configuração de APIs
  try {
    const r = await fetch(`${base}/v1/config`);
    const j = await r.json();
    const okc = r.status === 200 && Array.isArray(j.providers);
    ok('GET /v1/config', okc, okc
      ? `ativas: ${(j.activeProviders || []).join(', ')}` : JSON.stringify(j).slice(0, 100));
    if (!okc) failures++;
  } catch (e) {
    ok('GET /v1/config', false, e.message);
    failures++;
  }

  // 2c. Usuários (login do chat web)
  try {
    const r = await fetch(`${base}/v1/users`);
    const j = await r.json();
    const oku = r.status === 200 && Array.isArray(j.users);
    ok('GET /v1/users', oku, oku ? `${j.users.length} usuário(s) cadastrado(s)` : JSON.stringify(j).slice(0, 100));
    if (!oku) failures++;
  } catch (e) {
    ok('GET /v1/users', false, e.message);
    failures++;
  }

  // 2d. Projetos (agrupamento de conversas por usuário)
  try {
    const uid = 'testproj';
    const cr = await (await fetch(`${base}/v1/projects?userId=${uid}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Proj Teste' })
    })).json();
    const ls = await (await fetch(`${base}/v1/projects?userId=${uid}`)).json();
    const de = await (await fetch(`${base}/v1/projects/${cr.project?.id}?userId=${uid}`, { method: 'DELETE' })).json();
    const okp = cr.success && Array.isArray(ls.projects) && de.success;
    ok('Projetos (criar/listar/apagar)', okp, okp ? 'CRUD OK' : 'falhou');
    if (!okp) failures++;
  } catch (e) {
    ok('Projetos (criar/listar/apagar)', false, e.message);
    failures++;
  }

  // 2e. Path traversal em projects
  try {
    const j = await (await fetch(`${base}/v1/projects?userId=..%2Fetc`)).json();
    ok('Projetos (path traversal)', Array.isArray(j.projects) && j.projects.length === 0, 'bloqueado');
  } catch (e) {
    ok('Projetos (path traversal)', false, e.message);
    failures++;
  }

  // 3. Listar modelos
  try {
    const r = await fetch(`${base}/v1/models`);
    const j = await r.json();
    const n = Array.isArray(j.data) ? j.data.length : 0;
    ok('GET /v1/models', r.status === 200 && n > 0, `${n} modelos disponíveis`);
    if (r.status !== 200 || n === 0) failures++;
  } catch (e) {
    ok('GET /v1/models', false, e.message);
    failures++;
  }

  // 3. Chat completion (rotação automática)
  try {
    const r = await fetch(`${base}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer local-ai-server',
      },
      body: JSON.stringify({
        model: 'auto',
        messages: [{ role: 'user', content: 'Responder apenas com: OK' }],
        stream: false,
      }),
    });
    const j = await r.json();
    const content = j.choices?.[0]?.message?.content?.trim() ?? JSON.stringify(j).slice(0, 120);
    ok('POST /v1/chat/completions', r.status === 200, `modelo: ${j.model || '?'} | resposta: ${content}`);
    if (r.status !== 200) failures++;
  } catch (e) {
    ok('POST /v1/chat/completions', false, e.message);
    failures++;
  }

  console.log('');
  console.log(failures === 0 ? '🎉 Todos os testes passaram! Servidor funcionando.' : `⚠️  ${failures} teste(s) falharam.`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
