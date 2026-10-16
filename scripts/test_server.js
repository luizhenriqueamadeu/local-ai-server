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

  // 2. Listar modelos
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
