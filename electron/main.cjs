/**
 * BeerFlow POS — Electron main process
 * Runs Vite production preview on localhost, then opens BrowserWindow.
 * (TanStack Start is SSR — static-only load = blank window.)
 */
const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { spawn } = require("node:child_process");
const net = require("node:net");

const APP_FOLDER = "BeerFlowPOS";
const PREVIEW_PORT = 19238;

let mainWindow = null;
let previewChild = null;

function projectRoot() {
  // Packaged (asar:false): resources/app has full project
  // Dev: electron/ folder sits inside project
  try {
    const appPath = app.getAppPath();
    if (fs.existsSync(path.join(appPath, "package.json"))) return appPath;
  } catch (_) {}
  return path.join(__dirname, "..");
}

function waitForPort(port, host, timeoutMs) {
  host = host || "127.0.0.1";
  timeoutMs = timeoutMs || 120000;
  const start = Date.now();
  return new Promise(function (resolve, reject) {
    function tryOnce() {
      const socket = net.connect(port, host, function () {
        socket.end();
        resolve();
      });
      socket.on("error", function () {
        socket.destroy();
        if (Date.now() - start > timeoutMs) {
          reject(new Error("Server did not start on port " + port + ". First run: npm run build"));
        } else {
          setTimeout(tryOnce, 500);
        }
      });
    }
    tryOnce();
  });
}

function startPreviewServer() {
  const root = projectRoot();
  const viteBin = path.join(root, "node_modules", "vite", "bin", "vite.js");
  const withEnv = path.join(root, "scripts", "with-app-env.mjs");

  if (!fs.existsSync(viteBin)) {
    return Promise.reject(
      new Error("vite not found at " + viteBin + "\nInstall folder may be incomplete. Reinstall the app.")
    );
  }

  // Check build exists
  const vercelStatic = path.join(root, ".vercel", "output", "static");
  if (!fs.existsSync(vercelStatic)) {
    return Promise.reject(
      new Error("Production build missing (.vercel/output/static).\nRebuild with: npm run build")
    );
  }

  var cmd = process.execPath; // Electron's node or system — use process.execPath carefully
  // In Electron, process.execPath is the Electron binary, NOT node.
  // Use ELECTRON_RUN_AS_NODE=1 or find node.
  var args;
  var env = Object.assign({}, process.env, {
    HOST: "127.0.0.1",
    PORT: String(PREVIEW_PORT),
    ELECTRON_RUN_AS_NODE: "1",
  });

  if (fs.existsSync(withEnv)) {
    args = [withEnv, viteBin, "preview", "--host", "127.0.0.1", "--port", String(PREVIEW_PORT)];
  } else {
    args = [viteBin, "preview", "--host", "127.0.0.1", "--port", String(PREVIEW_PORT)];
  }

  // Use Electron binary as Node (ELECTRON_RUN_AS_NODE) — no system Node required
  previewChild = spawn(process.execPath, args, {
    cwd: root,
    env: env,
    stdio: "pipe",
    windowsHide: true,
  });

  previewChild.stdout && previewChild.stdout.on("data", function (d) {
    console.log("[preview]", String(d).trim());
  });
  previewChild.stderr && previewChild.stderr.on("data", function (d) {
    console.error("[preview]", String(d).trim());
  });
  previewChild.on("error", function (err) {
    console.error("[preview spawn error]", err);
  });

  return waitForPort(PREVIEW_PORT);
}

function helpHtml(msg) {
  return (
    "data:text/html;charset=utf-8," +
    encodeURIComponent(
      "<!DOCTYPE html><html><body style=\"margin:0;font-family:system-ui;background:#141210;color:#f5f0e8;padding:48px;max-width:640px\">" +
        "<h1 style=\"font-size:28px\">BeerFlow POS</h1>" +
        "<p style=\"line-height:1.5;opacity:.9\">" +
        String(msg).replace(/</g, "&lt;") +
        "</p>" +
        "<hr style=\"border-color:#333;margin:24px 0\"/>" +
        "<p><b>Backup method (always works):</b></p>" +
        "<ol style=\"line-height:1.7\">" +
        "<li>Open folder <code>pos_extract</code></li>" +
        "<li>Double-click <code>START-POS.bat</code> OR run <code>npm run dev</code></li>" +
        "<li>Browser: <code>http://localhost:8080</code></li>" +
        "</ol></body></html>"
    )
  );
}

function createWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    title: "BeerFlow POS",
    backgroundColor: "#141210",
    show: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      partition: "persist:beerflowpos",
      spellcheck: false,
    },
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadURL(url);
  mainWindow.webContents.on("did-fail-load", function (_e, code, desc) {
    mainWindow.loadURL(helpHtml("Page failed to load (" + code + "): " + desc));
  });
  mainWindow.on("closed", function () {
    mainWindow = null;
  });
  mainWindow.webContents.setWindowOpenHandler(function (details) {
    shell.openExternal(details.url);
    return { action: "deny" };
  });
}

async function boot() {
  app.setPath("userData", path.join(app.getPath("appData"), APP_FOLDER));

  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }
  app.on("second-instance", function () {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  await app.whenReady();

  try {
    // Prefer existing dev server in development
    if (!app.isPackaged) {
      var devUp = await new Promise(function (resolve) {
        var s = net.connect(8080, "127.0.0.1", function () {
          s.end();
          resolve(true);
        });
        s.on("error", function () {
          resolve(false);
        });
      });
      if (devUp) {
        createWindow("http://127.0.0.1:8080");
        return;
      }
    }

    await startPreviewServer();
    createWindow("http://127.0.0.1:" + PREVIEW_PORT);
  } catch (err) {
    console.error(err);
    createWindow(helpHtml(String(err && err.message ? err.message : err)));
  }
}

function killPreview() {
  if (!previewChild || previewChild.killed) return;
  try {
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(previewChild.pid), "/f", "/t"], { windowsHide: true });
    } else {
      previewChild.kill("SIGTERM");
    }
  } catch (_) {}
  previewChild = null;
}

app.on("window-all-closed", function () {
  killPreview();
  if (process.platform !== "darwin") app.quit();
});
app.on("before-quit", function () {
  killPreview();
});

function wipeUserData() {
  var dir = app.getPath("userData");
  try {
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    return { ok: true, path: dir };
  } catch (err) {
    return { ok: false, error: String(err), path: dir };
  }
}

ipcMain.handle("pos:get-paths", function () {
  return {
    userData: app.getPath("userData"),
    isPackaged: app.isPackaged,
    version: app.getVersion(),
  };
});
ipcMain.handle("pos:wipe-all-data", async function () {
  BrowserWindow.getAllWindows().forEach(function (w) {
    w.destroy();
  });
  killPreview();
  var result = wipeUserData();
  setTimeout(function () {
    app.quit();
  }, 400);
  return result;
});
ipcMain.handle("pos:show-message", async function (_e, title, message) {
  await dialog.showMessageBox({
    type: "info",
    title: title || "BeerFlow POS",
    message: message || "",
  });
});

boot().catch(function (err) {
  console.error(err);
  dialog.showErrorBox("BeerFlow POS failed", String(err));
  app.quit();
});
