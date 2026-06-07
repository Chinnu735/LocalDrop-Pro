const { app, BrowserWindow } = require('electron');
const path = require('path');

// 🚀 Brutal & Perfect Architecture: 
// We boot the Node.js Signaling Server directly inside the Electron main process!
// This means ZERO external dependencies or background processes for the user.
require('./server/index.js');

function createWindow () {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    autoHideMenuBar: true,
    title: "LocalDrop Pro",
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  // Load the built Vite UI
  win.loadFile(path.join(__dirname, 'client/dist/index.html'));
}

app.whenReady().then(createWindow);

// Strict Security: Zero background drain when closed.
app.on('window-all-closed', () => {
  app.quit();
  process.exit(0); // Forcibly kill the integrated signaling server
});
