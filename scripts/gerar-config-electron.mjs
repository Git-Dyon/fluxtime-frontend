/**
 * Gera electron/config.cjs a partir do MESMO valor que o Vite embute no bundle.
 *
 * Por que isto existe: o processo main do Electron não enxerga `import.meta.env`.
 * Ele lia `process.env.VITE_API_URL`, que só existe enquanto há um `.env` no
 * disco — ou seja, na máquina de desenvolvimento. No app empacotado o valor era
 * `undefined`, a CSP caía no fallback `http://localhost:3741` e **bloqueava toda
 * chamada à API real**: o instalador funcionava, a tela de login aparecia, e
 * nenhuma requisição saía. Falha silenciosa que só aparece numa máquina limpa.
 *
 * Com o arquivo gerado a partir de `.env.production`, o renderer e a CSP passam
 * a ler a mesma origem, sem chance de divergir.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ehProducao = process.env.NODE_ENV !== 'development';

/**
 * Build de simulação: libera backend em localhost/http.
 *
 * Existe para um caso só — validar a stack do docker-compose com o instalador
 * de verdade, na mesma máquina. Fora disso as travas abaixo continuam valendo,
 * porque um .exe distribuído apontando para localhost não funciona para
 * ninguém além de quem compilou.
 */
const ehSimulacao = process.env.FLUXTIME_SIM === '1';

/** Lê uma chave de um arquivo .env sem depender de pacote externo. */
function lerDoEnv(arquivo, chave) {
  let conteudo;
  try {
    conteudo = readFileSync(resolve(RAIZ, arquivo), 'utf8');
  } catch {
    return null;
  }
  for (const linha of conteudo.split('\n')) {
    const limpa = linha.trim();
    if (!limpa || limpa.startsWith('#')) continue;
    const igual = limpa.indexOf('=');
    if (igual === -1) continue;
    if (limpa.slice(0, igual).trim() !== chave) continue;
    return limpa
      .slice(igual + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
  }
  return null;
}

/**
 * Precedência do Vite, do mais forte para o mais fraco.
 *
 * A lista precisa ser COMPLETA, não "a parte que importa". A versão anterior
 * tinha só `.env.production.local` e `.env.production`, deixando `.env.local`
 * de fora — e no Vite `.env.local` ganha de `.env.production`. Um
 * desenvolvedor com `.env.local` apontando para localhost geraria um
 * instalador cujo BUNDLE chama localhost enquanto este script, a CSP e as
 * travas de produção veem a URL do Render e aprovam. É o mesmo defeito já
 * corrigido para `.env.production.local`, pelo único arquivo que a correção
 * não cobria.
 *
 * `.env` entra no fim: hoje é inerte, porque perde para `.env.production` —
 * mas ele define `VITE_API_URL` em localhost, então a mina está carregada.
 */
const arquivosDeOrigem = ehProducao
  ? ['.env.production.local', '.env.local', '.env.production', '.env']
  : ['.env.development'];

/**
 * As duas chaves são obrigatórias e independentes.
 *
 * O renderer lê `VITE_API_URL` em `src/lib/api.ts` e `VITE_SOCKET_URL` em
 * `src/lib/socket.ts`, separadamente. Este script validava apenas a primeira e
 * derivava a origem do socket dela. Consequência: preencher só a chave citada
 * na mensagem de erro deixava `VITE_SOCKET_URL` com o placeholder, e o
 * instalador saía com login funcionando e tempo real nunca conectando — meia
 * falha, sem mensagem em lugar nenhum.
 */
function resolverChave(chave) {
  if (process.env[chave]) return { valor: process.env[chave], arquivo: 'ambiente' };

  for (const arquivo of arquivosDeOrigem) {
    const valor = lerDoEnv(arquivo, chave);
    if (valor) return { valor, arquivo };
  }
  return { valor: null, arquivo: arquivosDeOrigem.join(', ') };
}

function exigirUrlUtilizavel(chave) {
  const { valor, arquivo } = resolverChave(chave);

  if (!valor) {
    console.error(`❌ ${chave} não encontrada em ${arquivo} nem no ambiente.`);
    process.exit(1);
  }

  if (valor.includes('<') || valor.includes('>')) {
    console.error(
      `❌ ${arquivo} ainda está com o placeholder em ${chave}: "${valor}"\n` +
        '   Troque <SEU-APP> pela URL pública do backend antes de compilar.\n' +
        '   Atenção: VITE_API_URL e VITE_SOCKET_URL são duas linhas separadas.',
    );
    process.exit(1);
  }

  try {
    return { url: valor, origem: new URL(valor).origin, arquivo };
  } catch {
    console.error(`❌ ${chave} não é uma URL válida: "${valor}"`);
    return process.exit(1);
  }
}

const api = exigirUrlUtilizavel('VITE_API_URL');
const socket = exigirUrlUtilizavel('VITE_SOCKET_URL');

const apiUrl = api.url;
const arquivoDeOrigem = api.arquivo;
const origem = api.origem;

/**
 * Trava de segurança do build de produção.
 *
 * Empacotar um instalador apontando para a máquina de quem compilou é
 * exatamente o defeito que este script existe para impedir — e é invisível até
 * alguém instalar o .exe em outro computador.
 *
 * `FLUXTIME_SIM=1` é a única saída, e é explícita: quem digita a variável sabe
 * que está gerando um build que só serve para testar a stack local.
 */
if (ehProducao && ehSimulacao) {
  console.warn(
    `⚠️  FLUXTIME_SIM=1 — build de SIMULAÇÃO, aceitando ${origem}.\n` +
      '   Este instalador só funciona na máquina que roda o backend. Não distribua.',
  );
} else if (ehProducao) {
  // As travas valem para as DUAS origens. Aplicá-las só à da API deixava
  // passar um VITE_SOCKET_URL em localhost ou em http: o app instalado logava
  // normalmente e o tempo real nunca conectava, sem nada na tela explicando.
  for (const [chave, alvo] of [
    ['VITE_API_URL', api],
    ['VITE_SOCKET_URL', socket],
  ]) {
    const ehLocal = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:|$)/i.test(alvo.origem);
    if (ehLocal) {
      console.error(
        `❌ Build de produção com ${chave} apontando para a máquina local: ${alvo.origem}\n` +
          `   Ajuste ${alvo.arquivo} para a URL pública do backend antes de gerar o instalador.`,
      );
      process.exit(1);
    }
    if (!alvo.origem.startsWith('https://')) {
      console.error(
        `❌ Build de produção com ${chave} em HTTP: ${alvo.origem}\n` +
          '   O token de sessão trafega neste canal — precisa ser https://.',
      );
      process.exit(1);
    }
  }
}

// O Socket.IO usa transporte websocket. A CSP trata ws/wss como esquema próprio,
// então `connect-src https://host` não cobre `wss://host` de forma confiável
// entre versões do Chromium: a origem do socket vai listada à parte.
//
// Derivada de VITE_SOCKET_URL, não de VITE_API_URL: as duas são configuradas
// em linhas separadas e podem apontar para hosts diferentes. Derivar da API
// fazia a CSP liberar um host e o renderer tentar outro.
const origemSocket = socket.origem.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:');

const conteudo = `// GERADO por scripts/gerar-config-electron.mjs — não edite à mão.
// Origem: ${arquivoDeOrigem} (VITE_API_URL) e ${socket.arquivo} (VITE_SOCKET_URL)
module.exports = {
  apiUrl: ${JSON.stringify(apiUrl)},
  apiOrigin: ${JSON.stringify(origem)},
  socketOrigin: ${JSON.stringify(origemSocket)},
};
`;

writeFileSync(resolve(RAIZ, 'electron', 'config.cjs'), conteudo, 'utf8');
console.log(`✓ electron/config.cjs gerado — API em ${origem}, socket em ${origemSocket}`);
