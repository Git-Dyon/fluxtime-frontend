// Electron main process (CommonJS for compatibility)
const { app, BrowserWindow, ipcMain, session, shell } = require('electron');
const path = require('path');

// Gerado no build a partir de .env.production — a mesma origem que o Vite embute
// no bundle. Ver scripts/gerar-config-electron.mjs.
const config = require('./config.cjs');

const isDev = process.env.NODE_ENV === 'development';

// Origens que a janela pode carregar. Qualquer outra navegação é bloqueada e,
// se for um link legítimo, aberta no navegador do sistema.
const ORIGENS_PERMITIDAS = isDev ? ['http://localhost:5173'] : ['file://'];

/**
 * CSP aplicada a todas as respostas carregadas pela janela.
 *
 * Em dev o Vite injeta scripts inline e usa websocket para HMR, então precisa de
 * 'unsafe-inline' e ws:. Em produção o bundle é estático e a política é fechada.
 *
 * A origem vem de config.cjs, não de process.env: o app empacotado não tem `.env`
 * e o processo main não enxerga o que o Vite embutiu no renderer. Lendo do
 * ambiente, a CSP de produção caía em localhost e bloqueava a API inteira.
 *
 * `socketOrigin` aparece separado porque `wss:` é um esquema próprio para a CSP —
 * `connect-src https://host` não o cobre de forma confiável, e sem ele o tempo
 * real não conecta.
 */
function politicaCsp() {
  const conecta = isDev
    ? `'self' ${config.apiOrigin} ${config.socketOrigin} http://localhost:3741 ws://localhost:5173 ws://localhost:3741`
    : `'self' ${config.apiOrigin} ${config.socketOrigin}`;

  return [
    "default-src 'self'",
    isDev ? "script-src 'self' 'unsafe-inline'" : "script-src 'self'",
    "style-src 'self' 'unsafe-inline'", // CSS Modules injeta <style> em runtime
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src ${conecta}`,
    "object-src 'none'",
    "frame-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
}

function ehPermitida(url) {
  return ORIGENS_PERMITIDAS.some((origem) => url.startsWith(origem));
}

function createWindow() {
  const win = new BrowserWindow({
    width: 420,
    height: 800,
    resizable: false,
    maximizable: false,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#e7eaef',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
    },
    icon: path.join(__dirname, '..', 'public', 'icon.ico'),
  });

  // Center on screen
  win.center();

  // Links externos (target="_blank", window.open) nunca abrem uma janela Electron:
  // vão para o navegador do sistema, fora do contexto privilegiado do app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });

  // Navegação da própria janela para fora da origem do app é bloqueada.
  win.webContents.on('will-navigate', (evento, url) => {
    if (!ehPermitida(url)) {
      evento.preventDefault();
      if (url.startsWith('https://')) void shell.openExternal(url);
    }
  });

  if (isDev) {
    win.loadURL('http://localhost:5173');
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
  session.defaultSession.webRequest.onHeadersReceived((detalhes, callback) => {
    callback({
      responseHeaders: {
        ...detalhes.responseHeaders,
        'Content-Security-Policy': [politicaCsp()],
        'X-Content-Type-Options': ['nosniff'],
      },
    });
  });

  // Nenhuma tela do FluxTime usa câmera, microfone ou geolocalização.
  session.defaultSession.setPermissionRequestHandler((_conteudo, _permissao, callback) => callback(false));

  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// IPC: minimize / close window
ipcMain.on('window-minimize', () => {
  const win = BrowserWindow.getFocusedWindow();
  if (win) win.minimize();
});

ipcMain.on('window-close', () => {
  const win = BrowserWindow.getFocusedWindow();
  if (win) win.close();
});
