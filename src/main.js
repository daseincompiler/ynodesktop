const { app, ipcMain } = require('electron');
const {
  initModules,
  setupContextMenu,
  createWindow,
  setupIpc,
  restoreSession,
  getMainWindow,
} = require('./createApp');
const { connectDiscordRpc, updateRichPresence, clearPresence } = require('./scripts/discordRpcUtils');
const { checkForUpdates } = require('./scripts/updateChecker');

// Linux: Chromium's default ozone platform pick can paint white on some
// distros (Arch/CachyOS via AppImage was the reported case). Letting Ozone
// auto-pick is enough; extra GTK3/Vulkan/sandbox flags aren't needed and
// break in-game canvas rendering. See electron/electron#33690.
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('ozone-platform-hint', 'auto');
}

let rpcInterval = null;

function startRpc() {
  if (rpcInterval) return;
  connectDiscordRpc().then(() => {
    rpcInterval = setInterval(() => {
      const win = getMainWindow();
      if (!win) return;
      updateRichPresence(win.webContents, win.webContents.getURL()).catch(console.error);
    }, 1500);
  }).catch((err) => {
    console.error('Failed to connect Discord RPC:', err);
  });
}

function stopRpc() {
  if (rpcInterval) {
    clearInterval(rpcInterval);
    rpcInterval = null;
  }
  clearPresence().catch(console.error);
}

app.whenReady().then(async () => {
  const store = await initModules();
  setupContextMenu();
  restoreSession();
  setupIpc();
  const win = createWindow();

  checkForUpdates(win);

  ipcMain.handle('getDiscordRpcEnabled', () => store.get('discordRpcEnabled', true));

  ipcMain.handle('toggleDiscordRpc', () => {
    const newState = !store.get('discordRpcEnabled', true);
    store.set('discordRpcEnabled', newState);
    console.log(`[Discord RPC] ${newState ? 'enabled' : 'disabled'} by user`);
    if (newState) startRpc();
    else stopRpc();
    return newState;
  });

  if (store.get('discordRpcEnabled', true)) {
    startRpc();
  }
});
