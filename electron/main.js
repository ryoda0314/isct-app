const { app, BrowserWindow, shell } = require("electron");
const path = require("path");

const APP_URL = "https://sciencetokyo.app";

function createWindow() {
  const win = new BrowserWindow({
    width: 430,
    height: 900,
    minWidth: 360,
    minHeight: 600,
    icon: path.join(__dirname, "../public/icons/icon-512x512.png"),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    autoHideMenuBar: true,
    titleBarStyle: "default",
    title: "ScienceTokyo",
  });

  win.loadURL(APP_URL);

  // 外部リンクはデフォルトブラウザで開く
  win.webContents.setWindowOpenHandler(({ url }) => {
    // アプリ内URLはアプリ内で開く
    if (url.startsWith(APP_URL) || url.includes("sciencetokyo.app")) {
      return { action: "allow" };
    }
    shell.openExternal(url);
    return { action: "deny" };
  });

  // ページ内のtarget="_blank"リンクもハンドル
  win.webContents.on("will-navigate", (event, url) => {
    if (
      !url.startsWith(APP_URL) &&
      !url.includes("sciencetokyo.app") &&
      !url.includes("supabase.co")
    ) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
