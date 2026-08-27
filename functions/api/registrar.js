/**
 * Cloudflare Pages Function — ponte entre o portal e o Power Automate.
 *
 * Existe por dois motivos:
 *  1. O gatilho HTTP do Power Automate não devolve cabeçalhos CORS, então o
 *     navegador não consegue chamá-lo direto nem ler o protocolo de volta.
 *  2. A URL do gatilho carrega a assinatura (sig=) no próprio link. Se ficasse
 *     no código da página, qualquer um poderia disparar o fluxo.
 *
 * Variáveis de ambiente (Pages → Settings → Environment variables, como Secret):
 *   FLOW_URL_EMERGENCIA   URL do gatilho do fluxo de emergência
 *   FLOW_URL_ATENDIMENTO  URL do gatilho do fluxo de atendimento
 *   FLOW_URL_SAUDE        URL do gatilho do fluxo de saúde mental
 *   FLOW_TOKEN            segredo compartilhado; o fluxo compara e rejeita se diferir
 *   TURNSTILE_SECRET      opcional; se ausente, a verificação do Turnstile é pulada
 */

const FLUXOS = {
  EMERGENCIA: 'FLOW_URL_EMERGENCIA',
  ATENDIMENTO: 'FLOW_URL_ATENDIMENTO',
  SAUDE: 'FLOW_URL_SAUDE',
};

const LIMITE_CAMPO = 2000;
const TIMEOUT_MS = 20000;

function json(dados, status = 200) {
  return new Response(JSON.stringify(dados), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

async function turnstileValido(env, token, ip) {
  if (!env.TURNSTILE_SECRET) return true; // Turnstile ainda não ligado
  if (!token) return false;

  const corpo = new FormData();
  corpo.append('secret', env.TURNSTILE_SECRET);
  corpo.append('response', token);
  if (ip) corpo.append('remoteip', ip);

  const resp = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: corpo,
  });
  const resultado = await resp.json();
  return resultado.success === true;
}

function higienizar(dados) {
  const limpo = {};
  for (const [chave, valor] of Object.entries(dados || {})) {
    if (typeof valor !== 'string') continue;
    const texto = valor.trim();
    if (texto) limpo[chave] = texto.slice(0, LIMITE_CAMPO);
  }
  return limpo;
}

export async function onRequestPost({ request, env }) {
  let corpo;
  try {
    corpo = await request.json();
  } catch {
    return json({ erro: 'payload_invalido' }, 400);
  }

  const nomeVariavel = FLUXOS[corpo.caminho];
  if (!nomeVariavel) return json({ erro: 'caminho_invalido' }, 400);

  const urlFluxo = env[nomeVariavel];
  if (!urlFluxo) return json({ erro: 'fluxo_nao_configurado' }, 503);

  const ip = request.headers.get('CF-Connecting-IP');
  if (!(await turnstileValido(env, corpo.turnstileToken, ip))) {
    return json({ erro: 'verificacao_falhou' }, 403);
  }

  const dados = higienizar(corpo.dados);
  if (Object.keys(dados).length === 0) return json({ erro: 'sem_dados' }, 400);

  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), TIMEOUT_MS);

  try {
    const resposta = await fetch(urlFluxo, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-canal-sms-token': env.FLOW_TOKEN || '',
      },
      body: JSON.stringify({ caminho: corpo.caminho, dados }),
      signal: controle.signal,
    });

    if (!resposta.ok) return json({ erro: 'fluxo_recusou', status: resposta.status }, 502);

    const resultado = await resposta.json().catch(() => ({}));
    return json({ protocolo: resultado.protocolo || null });
  } catch {
    // O portal trata qualquer falha seguindo para o WhatsApp sem protocolo.
    return json({ erro: 'fluxo_indisponivel' }, 504);
  } finally {
    clearTimeout(relogio);
  }
}

// Só POST é aceito. GET responde 405 em vez de vazar a existência do endpoint.
export async function onRequestGet() {
  return json({ erro: 'metodo_nao_permitido' }, 405);
}
