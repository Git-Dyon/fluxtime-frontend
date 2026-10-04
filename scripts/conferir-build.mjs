/**
 * Confere o bundle já gerado contra os defeitos que só aparecem empacotado.
 *
 * Os três abaixo têm a mesma assinatura: o app abre, a tela aparece, e algo não
 * funciona sem dizer por quê. Nenhum deles aparece em `npm run dev`, onde o
 * servidor do Vite serve por http:// e o navegador já tem a fonte em cache.
 *
 *   1. Recurso remoto no CSS — a CSP do Electron é `style-src 'self'` e
 *      `font-src 'self' data:`. Qualquer @import ou url() apontando para fora
 *      é bloqueado em silêncio. Foi o que manteve a Montserrat fora do app
 *      empacotado desde o início.
 *
 *   2. Caminho absoluto de asset — a janela carrega por `file://`, então um
 *      `/fonts/x.woff2` resolve para a RAIZ DO DISCO, não para a pasta do app.
 *      Quem protege disso é o `base: './'` do vite.config; este teste é o que
 *      avisa se alguém tirar.
 *
 *   3. Fonte declarada mas ausente do dist — @font-face apontando para arquivo
 *      que não foi copiado volta ao fallback sem erro visível.
 *
 *   node scripts/conferir-build.mjs
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(RAIZ, 'dist');

if (!existsSync(DIST)) {
  console.error('❌ dist/ não existe. Rode `npm run build` antes.');
  process.exit(1);
}

const problemas = [];
const cssFiles = readdirSync(join(DIST, 'assets')).filter((f) => f.endsWith('.css'));
const htmlFiles = ['index.html'];

for (const arquivo of cssFiles) {
  const css = readFileSync(join(DIST, 'assets', arquivo), 'utf8');

  // (1) Recurso remoto — a CSP bloqueia.
  for (const [, url] of css.matchAll(/url\(\s*['"]?(https?:\/\/[^)'"]+)/g)) {
    problemas.push(`${arquivo}: url() remota, a CSP bloqueia: ${url}`);
  }
  for (const [, url] of css.matchAll(/@import\s+(?:url\()?['"]?(https?:\/\/[^)'";]+)/g)) {
    problemas.push(`${arquivo}: @import remoto, a CSP bloqueia: ${url}`);
  }

  // (2) Caminho absoluto — quebra sob file://.
  for (const [, url] of css.matchAll(/url\(\s*['"]?(\/[^/)'"][^)'"]*)/g)) {
    problemas.push(`${arquivo}: caminho absoluto "${url}" — sob file:// resolve na raiz do disco`);
  }

  // (3) Fonte declarada que não existe no dist.
  for (const [, rel] of css.matchAll(/url\(\s*['"]?((?:\.\.?\/)[^)'"]+\.woff2?)/g)) {
    const alvo = resolve(join(DIST, 'assets'), rel);
    if (!existsSync(alvo)) problemas.push(`${arquivo}: fonte declarada e ausente do dist: ${rel}`);
  }
}

for (const arquivo of htmlFiles) {
  const html = readFileSync(join(DIST, arquivo), 'utf8');
  for (const [, url] of html.matchAll(/<link[^>]+href=["'](https?:\/\/[^"']+)/g)) {
    problemas.push(`${arquivo}: <link> remoto, a CSP bloqueia: ${url}`);
  }
  for (const [, attr, url] of html.matchAll(/(src|href)=["'](\/[^/"'][^"']*)["']/g)) {
    problemas.push(`${arquivo}: ${attr} absoluto "${url}" — sob file:// resolve na raiz do disco`);
  }
}

// Confere que a fonte do app realmente viajou no pacote.
const fontes = existsSync(join(DIST, 'fonts')) ? readdirSync(join(DIST, 'fonts')) : [];
const woff2 = fontes.filter((f) => f.endsWith('.woff2'));
if (woff2.length === 0) {
  problemas.push('dist/fonts/ sem nenhum .woff2 — o app cairia em Helvetica');
}

if (problemas.length > 0) {
  console.error(`\n❌ ${problemas.length} problema(s) no bundle:\n`);
  for (const p of problemas) console.error(`   • ${p}`);
  console.error('');
  process.exit(1);
}

console.log(`\n✅ bundle ok — ${cssFiles.length} CSS, ${woff2.length} fontes empacotadas, nenhum recurso remoto ou caminho absoluto.\n`);
