import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Injeta a CSP como `<meta>` no index.html do build.
 *
 * O processo main já injeta uma CSP por cabeçalho HTTP
 * (`electron/main.cjs` → `onHeadersReceived`), e isso cobre o modo de
 * desenvolvimento, onde a página vem do dev server por http://. Não cobre
 * produção: lá a janela é carregada com `win.loadFile(...)`, ou seja por
 * `file://`, e um cabeçalho HTTP não existe para um recurso de arquivo — a
 * própria documentação do Electron aponta o `<meta>` como o caminho para esse
 * caso.
 *
 * Resultado antes disto: o app EMPACOTADO rodava sem CSP nenhuma — sem
 * `script-src`, sem `object-src 'none'`, sem `base-uri 'none'` — enquanto em
 * desenvolvimento a política estava ativa. O inverso do desejado, e invisível
 * justamente porque só o ambiente de dev mostrava a política funcionando.
 *
 * As origens vêm do ambiente no momento do build, pelas mesmas variáveis que o
 * bundle embute, para que a política e o código não possam divergir.
 */
function cspNoIndexHtml(): Plugin {
  return {
    name: 'fluxtime-csp-meta',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const api = origemDe('VITE_API_URL')
        const socket = origemDe('VITE_SOCKET_URL')
        const wss = socket.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:')

        // `file:` acompanha `'self'` porque o Chromium não resolve `'self'` de
        // forma confiável para uma página carregada de file:// — sem ele, a
        // política bloquearia o próprio bundle do app.
        const politica = [
          "default-src 'self' file:",
          "script-src 'self' file:",
          // CSS Modules injeta <style> em runtime.
          "style-src 'self' file: 'unsafe-inline'",
          "img-src 'self' file: data: blob:",
          "font-src 'self' file: data:",
          `connect-src 'self' ${api} ${socket} ${wss}`,
          "object-src 'none'",
          "frame-src 'none'",
          "base-uri 'none'",
          "form-action 'none'",
        ].join('; ')

        return html.replace(
          '<head>',
          `<head>\n    <meta http-equiv="Content-Security-Policy" content="${politica}" />`,
        )
      },
    },
  }
}

/** Lê a origem de uma variável VITE_*, do ambiente ou dos arquivos .env. */
function origemDe(chave: string): string {
  const bruto = process.env[chave] ?? leDosArquivos(chave)
  if (!bruto) {
    throw new Error(
      `${chave} ausente ao montar a CSP. O build deve rodar depois de ` +
        'scripts/gerar-config-electron.mjs, que valida as duas URLs.',
    )
  }
  return new URL(bruto).origin
}

function leDosArquivos(chave: string): string | null {
  // Mesma ordem de precedência do gerador de config e do próprio Vite.
  for (const arquivo of ['.env.production.local', '.env.local', '.env.production', '.env']) {
    let conteudo: string
    try {
      conteudo = readFileSync(resolve(__dirname, arquivo), 'utf8')
    } catch {
      continue
    }
    for (const linha of conteudo.split('\n')) {
      const limpa = linha.trim()
      if (!limpa || limpa.startsWith('#')) continue
      const igual = limpa.indexOf('=')
      if (igual === -1 || limpa.slice(0, igual).trim() !== chave) continue
      return limpa.slice(igual + 1).trim().replace(/^["']|["']$/g, '')
    }
  }
  return null
}

export default defineConfig({
  plugins: [react(), cspNoIndexHtml()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
  },
})
