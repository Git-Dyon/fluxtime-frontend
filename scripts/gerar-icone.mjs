/**
 * Gera public/icon.ico a partir de public/icon.svg.
 *
 * O bloco `build.win.icon` do package.json e a janela em electron/main.cjs
 * apontavam para um icon.ico que nunca existiu no repositório — só havia SVG, que
 * nem o electron-builder nem o Windows aceitam. O instalador saía com o ícone
 * genérico do Electron.
 *
 * Roda sob demanda (`npm run icone`), não no build: o SVG praticamente não muda,
 * e prender o build a uma dependência nativa (sharp) encareceria cada compilação.
 * O .ico fica versionado.
 */
import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ORIGEM = resolve(RAIZ, 'public', 'icon.svg');
const DESTINO = resolve(RAIZ, 'public', 'icon.ico');

// O Windows escolhe a resolução conforme o contexto: 16 na barra de título, 32
// na barra de tarefas, 48 no Explorer, 256 no instalador e em ícones grandes.
// Faltando um tamanho, ele reamostra outro e o resultado fica borrado.
const TAMANHOS = [16, 24, 32, 48, 64, 128, 256];

// `density` alto antes do resize: o SVG tem 32px de viewBox, e rasterizar na
// densidade padrão para depois ampliar produziria bordas serrilhadas.
const pngs = await Promise.all(
  TAMANHOS.map((lado) =>
    sharp(ORIGEM, { density: 600 })
      .resize(lado, lado, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer(),
  ),
);

writeFileSync(DESTINO, await pngToIco(pngs));
console.log(`✓ public/icon.ico gerado (${TAMANHOS.join(', ')} px)`);
