const { contextBridge } = require('electron')

contextBridge.exposeInMainWorld('neuroaiDesktop', {
  isDesktop: true,
  platform: process.platform,
})
