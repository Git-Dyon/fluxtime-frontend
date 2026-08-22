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

const arquivoDeOrigem = ehProducao ? '.env.production' : '.env.development';
const apiUrl = process.env.VITE_API_URL ?? lerDoEnv(arquivoDeOrigem, 'VITE_API_URL');

if (!apiUrl) {
  console.error(`❌ VITE_API_URL não encontrada em ${arquivoDeOrigem} nem no ambiente.`);
  process.exit(1);
}

if (apiUrl.includes('<') || apiUrl.includes('>')) {
  console.error(
    `❌ ${arquivoDeOrigem} ainda está com o placeholder: "${apiUrl}"\n` +
      '   Troque <SEU-APP> pela URL pública do backend antes de compilar.',
  );
  process.exit(1);
}

let origem;
try {
  origem = new URL(apiUrl).origin;
} catch {
  console.error(`❌ VITE_API_URL não é uma URL válida: "${apiUrl}"`);
  process.exit(1);
}

/**
 * Trava de segurança do build de produção.
 *
 * Empacotar um instalador apontando para a máquina de quem compilou é
 * exatamente o defeito que este script existe para impedir — e é invisível até
 * alguém instalar o .exe em outro computador.
 */
if (ehProducao) {
  const ehLocal = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:|$)/i.test(origem);
  if (ehLocal) {
    console.error(
      `❌ Build de produção com VITE_API_URL apontando para a máquina local: ${origem}\n` +
        `   Ajuste ${arquivoDeOrigem} para a URL pública do backend antes de gerar o instalador.`,
    );
    process.exit(1);
  }
  if (!origem.startsWith('https://')) {
    console.error(
      `❌ Build de produção com backend em HTTP: ${origem}\n` +
        '   O token de sessão trafega neste canal — precisa ser https://.',
    );
    process.exit(1);
  }
}

// O Socket.IO usa transporte websocket. A CSP trata ws/wss como esquema próprio,
// então `connect-src https://host` não cobre `wss://host` de forma confiável
// entre versões do Chromium: a origem do socket vai listada à parte.
const origemSocket = origem.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:');

const conteudo = `// GERADO por scripts/gerar-config-electron.mjs — não edite à mão.
// Origem: ${arquivoDeOrigem} (VITE_API_URL)
module.exports = {
  apiUrl: ${JSON.stringify(apiUrl)},
  apiOrigin: ${JSON.stringify(origem)},
  socketOrigin: ${JSON.stringify(origemSocket)},
};
`;

writeFileSync(resolve(RAIZ, 'electron', 'config.cjs'), conteudo, 'utf8');
console.log(`✓ electron/config.cjs gerado — API em ${origem}`);
