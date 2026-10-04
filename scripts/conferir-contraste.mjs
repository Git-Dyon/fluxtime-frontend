/**
 * Confere o contraste dos tokens de cor contra a superfície do app (WCAG 2.1).
 *
 * Por que isto existe como script e não como opinião: o neumorfismo empurra o
 * texto para tons claros, e "está bonito" e "está legível" divergem sem que
 * ninguém perceba. A paleta original reprovava em 11 dos 14 tokens — o texto
 * primário em 4,08:1, abaixo do mínimo de 4,5:1 — e as piores eram justamente
 * as cores de prazo e severidade, que **carregam significado**. Um semáforo que
 * ninguém distingue com segurança não é decoração ruim, é informação perdida.
 *
 * Sai com código diferente de zero se algum token reprovar, então entra no
 * aceite do build em vez de depender de alguém reparar.
 *
 *   node scripts/conferir-contraste.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ARQUIVO = resolve(RAIZ, 'src/styles/tokens.css');

/** Fundo contra o qual o texto é lido: a superfície de cards e da janela. */
const TOKEN_DE_FUNDO = '--fx-surface';

/**
 * Limiar por token.
 *
 * 4,5:1 é o mínimo da norma para texto normal; 3,0:1 vale para texto grande e
 * para elementos de interface. Os tokens terciários ficam em 3,0 porque só
 * aparecem em rótulo pequeno sobre área ampla, nunca em corpo de texto.
 *
 * `--fx-text-dis` está ausente de propósito: texto desabilitado é isento na
 * norma, e precisa continuar lendo como desabilitado.
 */
const LIMIARES = {
  '--fx-text-1': 4.5,
  '--fx-text-2': 4.5,
  '--fx-text-3': 4.0,
  '--fx-text-4': 3.0,
  '--fx-text-5': 3.0,
  '--fx-text-input': 4.5,
  '--fx-placeholder': 3.0,
  '--fx-accent': 4.5,
  '--fx-error': 4.5,
  '--fx-green': 4.5,
  '--fx-yellow': 4.5,
  '--fx-orange': 4.5,
  '--fx-red': 4.5,
};

function lerTokens(css) {
  const tokens = {};
  for (const [, nome, valor] of css.matchAll(/(--fx-[\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/g)) {
    tokens[nome] = valor;
  }
  return tokens;
}

function paraRgb(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
}

/** Luminância relativa, conforme a definição da WCAG 2.1. */
function luminancia(hex) {
  const [r, g, b] = paraRgb(hex).map((v) =>
    v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contraste(a, b) {
  const [la, lb] = [luminancia(a), luminancia(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const css = readFileSync(ARQUIVO, 'utf8');
const tokens = lerTokens(css);
const fundo = tokens[TOKEN_DE_FUNDO];

if (!fundo) {
  console.error(`❌ ${TOKEN_DE_FUNDO} não encontrado em ${ARQUIVO}.`);
  process.exit(1);
}

const reprovados = [];
console.log(`\nContraste contra ${TOKEN_DE_FUNDO} (${fundo})\n`);
console.log(`  ${'token'.padEnd(20)} ${'cor'.padEnd(9)} ${'razão'.padStart(8)}  ${'mín'.padStart(5)}  situação`);
console.log(`  ${'-'.repeat(62)}`);

for (const [token, minimo] of Object.entries(LIMIARES)) {
  const cor = tokens[token];
  if (!cor) {
    reprovados.push(`${token} não existe em tokens.css`);
    console.log(`  ${token.padEnd(20)} ${'AUSENTE'.padEnd(9)} ${'—'.padStart(8)}  ${minimo.toFixed(1).padStart(5)}  AUSENTE`);
    continue;
  }
  const razao = contraste(cor, fundo);
  const passou = razao >= minimo;
  if (!passou) reprovados.push(`${token} (${cor}) em ${razao.toFixed(2)}:1, mínimo ${minimo.toFixed(1)}:1`);
  console.log(
    `  ${token.padEnd(20)} ${cor.padEnd(9)} ${razao.toFixed(2).padStart(8)}  ${minimo.toFixed(1).padStart(5)}  ${passou ? 'ok' : 'REPROVA'}`,
  );
}

if (reprovados.length > 0) {
  console.error(`\n❌ ${reprovados.length} token(s) reprovando o contraste mínimo:\n`);
  for (const r of reprovados) console.error(`   • ${r}`);
  console.error('');
  process.exit(1);
}

console.log(`\n✅ ${Object.keys(LIMIARES).length} tokens aprovados.\n`);
