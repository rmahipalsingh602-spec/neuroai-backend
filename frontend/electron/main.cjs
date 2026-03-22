const { app, BrowserWindow, dialog, shell } = require('electron')
const fs = require('fs')
const http = require('http')
const path = require('path')

const DEV_SERVER_URL = process.env.ELECTRON_RENDERER_URL || 'http://127.0.0.1:5173'
const DIST_DIR = path.join(__dirname, '..', 'dist')
const STATIC_PORTS = [4173, 3000, 5173]

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
}

let mainWindow = null
let staticServer = null
let appUrl = DEV_SERVER_URL

function getMimeType(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream'
}

function resolveDistPath(requestUrl) {
  const pathname = decodeURIComponent(new URL(requestUrl || '/', 'http://127.0.0.1').pathname)
  const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '')
  const resolvedPath = path.resolve(DIST_DIR, relativePath)
  const distRoot = path.resolve(DIST_DIR)

  if (!resolvedPath.startsWith(distRoot)) {
    return null
  }

  return resolvedPath
}

function serveFile(response, filePath) {
  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
      response.end('Unable to load the desktop app files.')
      return
    }

    response.writeHead(200, {
      'Cache-Control': filePath.endsWith('.html') ? 'no-cache' : 'public, max-age=31536000, immutable',
      'Content-Type': getMimeType(filePath),
    })
    response.end(data)
  })
}

function createStaticServer() {
  return new Promise((resolve, reject) => {
    const startOnPort = (portIndex) => {
      if (portIndex >= STATIC_PORTS.length) {
        reject(new Error('No local port was available for the packaged app.'))
        return
      }

      const port = STATIC_PORTS[portIndex]
      const server = http.createServer((request, response) => {
        const candidatePath = resolveDistPath(request.url)

        if (!candidatePath) {
          response.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' })
          response.end('Forbidden')
          return
        }

        fs.stat(candidatePath, (statError, stats) => {
          const fallbackPath = path.join(DIST_DIR, 'index.html')
          const filePath = !statError && stats.isFile() ? candidatePath : fallbackPath
          serveFile(response, filePath)
        })
      })

      server.once('error', (error) => {
        if (error.code === 'EADDRINUSE') {
          startOnPort(portIndex + 1)
          return
        }

        reject(error)
      })

      server.listen(port, '127.0.0.1', () => {
        resolve({
          server,
          url: `http://127.0.0.1:${port}`,
        })
      })
    }

    startOnPort(0)
  })
}

async function resolveAppUrl() {
  if (!app.isPackaged) {
    return DEV_SERVER_URL
  }

  const indexPath = path.join(DIST_DIR, 'index.html')
  if (!fs.existsSync(indexPath)) {
    throw new Error('Desktop build files are missing. Run "npm run build-desktop" from the frontend folder.')
  }

  const serverResult = await createStaticServer()
  staticServer = serverResult.server
  return serverResult.url
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1024,
    minHeight: 720,
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
      sandbox: true,
    },
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(appUrl)) {
      event.preventDefault()
      shell.openExternal(url)
    }
  })

  void mainWindow.loadURL(appUrl)
}

app.whenReady().then(async () => {
  try {
    appUrl = await resolveAppUrl()
    createWindow()
  } catch (error) {
    dialog.showErrorBox(
      'NeuroAI Desktop could not start',
      error instanceof Error ? error.message : 'Unknown startup error.',
    )
    app.quit()
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  if (staticServer) {
    staticServer.close()
    staticServer = null
  }
})
