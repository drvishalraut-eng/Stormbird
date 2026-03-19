// ─────────────────────────────────────────────────────────────────────────────
// preload.js — Exposes safe IPC bridge to the React renderer
// All renderer ↔ main communication goes through window.sb
// ─────────────────────────────────────────────────────────────────────────────

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sb', {

  // ── Window controls ──────────────────────────────────────────────────────
  win: {
    minimize : () => ipcRenderer.invoke('win:minimize'),
    maximize : () => ipcRenderer.invoke('win:maximize'),
    close    : () => ipcRenderer.invoke('win:close'),
    isMaximized: () => ipcRenderer.invoke('win:isMaximized'),
  },

  // ── Logger / Console ─────────────────────────────────────────────────────
  logger: {
    getRecent : (n)         => ipcRenderer.invoke('logger:getRecent', n),
    onLine    : (callback)  => {
      ipcRenderer.on('logger:line', (_, entry) => callback(entry));
      return () => ipcRenderer.removeAllListeners('logger:line');
    },
  },

  // ── Process Manager ──────────────────────────────────────────────────────
  processes: {
    getAll    : ()          => ipcRenderer.invoke('process:getAll'),
    diagnose  : (issueId)   => ipcRenderer.invoke('process:diagnose', issueId),
    resolve   : (issueId)   => ipcRenderer.invoke('process:resolve', issueId),
    retry     : (name)      => ipcRenderer.invoke('process:retry', name),
    onUpdate  : (callback)  => {
      ipcRenderer.on('process:update', (_, data) => callback(data));
      return () => ipcRenderer.removeAllListeners('process:update');
    },
    onIssue   : (callback)  => {
      ipcRenderer.on('process:issue', (_, issue) => callback(issue));
      return () => ipcRenderer.removeAllListeners('process:issue');
    },
    onCritical: (callback)  => {
      ipcRenderer.on('process:critical', (_, data) => callback(data));
      return () => ipcRenderer.removeAllListeners('process:critical');
    },
    onDiagnosis: (callback) => {
      ipcRenderer.on('process:diagnosis', (_, data) => callback(data));
      return () => ipcRenderer.removeAllListeners('process:diagnosis');
    },
  },

  // ── Accounts ─────────────────────────────────────────────────────────────
  accounts: {
    list        : ()        => ipcRenderer.invoke('accounts:list'),
    add         : (account) => ipcRenderer.invoke('accounts:add', account),
    update      : (account) => ipcRenderer.invoke('accounts:update', account),
    remove      : (id)      => ipcRenderer.invoke('accounts:remove', id),
    testImap    : (config)  => ipcRenderer.invoke('accounts:testImap', config),
    testSmtp    : (config)  => ipcRenderer.invoke('accounts:testSmtp', config),
  },

  // ── Messages ─────────────────────────────────────────────────────────────
  messages: {
    folders      : (accountId)    => ipcRenderer.invoke('messages:folders', accountId),
    list         : (query)        => ipcRenderer.invoke('messages:list', query),
    get          : (id)           => ipcRenderer.invoke('messages:get', id),
    search       : (query)        => ipcRenderer.invoke('messages:search', query),
    globalSearch : (q, limit)     => ipcRenderer.invoke('messages:globalSearch', q, limit),
    allCounts    : ()             => ipcRenderer.invoke('messages:allCounts'),
    mark         : (id, flags)    => ipcRenderer.invoke('messages:mark', id, flags),
    delete       : (id)           => ipcRenderer.invoke('messages:delete', id),
    counts       : (accountId)    => ipcRenderer.invoke('messages:counts', accountId),
  },

  // ── Sync ─────────────────────────────────────────────────────────────────
  sync: {
    run        : (accountId) => ipcRenderer.invoke('sync:run', accountId),
    runAll     : ()          => ipcRenderer.invoke('sync:runAll'),
    status     : ()          => ipcRenderer.invoke('sync:status'),
    onProgress : (callback)  => {
      ipcRenderer.on('sync:progress', (_, data) => callback(data));
      return () => ipcRenderer.removeAllListeners('sync:progress');
    },
    onNewMail  : (callback)  => {
      ipcRenderer.on('sync:newMail', (_, data) => callback(data));
      return () => ipcRenderer.removeAllListeners('sync:newMail');
    },
  },

  // ── Import ───────────────────────────────────────────────────────────────
  importer: {
    importMbox : (filePath, accountId) => ipcRenderer.invoke('importer:importMbox', filePath, accountId),
    status     : ()                    => ipcRenderer.invoke('importer:status'),
    onProgress : (callback)            => {
      ipcRenderer.on('importer:progress', (_, data) => callback(data));
      return () => ipcRenderer.removeAllListeners('importer:progress');
    },
  },

  // ── Mail send / outbox / drafts ───────────────────────────────────────────
  mail: {
    send        : (msg)     => ipcRenderer.invoke('mail:send', msg),
    outbox      : ()        => ipcRenderer.invoke('mail:outbox'),
    outboxCount : ()        => ipcRenderer.invoke('mail:outboxCount'),
    retry       : (id)      => ipcRenderer.invoke('mail:retry', id),
    deleteOutbox: (id)      => ipcRenderer.invoke('mail:deleteOutbox', id),
    flushQueue  : ()        => ipcRenderer.invoke('mail:flushQueue'),
    saveDraft   : (draft)   => ipcRenderer.invoke('mail:saveDraft', draft),
    listDrafts  : ()        => ipcRenderer.invoke('mail:listDrafts'),
    deleteDraft : (id)      => ipcRenderer.invoke('mail:deleteDraft', id),
    testSmtp    : (config)  => ipcRenderer.invoke('mail:testSmtp', config),
    onUpdate    : (callback) => {
      ipcRenderer.on('outbox:update', (_, data) => callback(data));
      return () => ipcRenderer.removeAllListeners('outbox:update');
    },
  },

  // ── Network status ────────────────────────────────────────────────────────
  net: {
    onStatus: (callback) => {
      ipcRenderer.on('net:status', (_, data) => callback(data));
      return () => ipcRenderer.removeAllListeners('net:status');
    },
  },

  // ── App controls ──────────────────────────────────────────────────────────
  appControl: {
    stopAll      : ()           => ipcRenderer.invoke('app:stopAll'),
    stopAndExit  : ()           => ipcRenderer.invoke('app:stopAndExit'),
    installMode  : ()           => ipcRenderer.invoke('app:installMode'),
    ejectWillKill: (drive)      => ipcRenderer.invoke('app:ejectWillKillApp', drive),
    isFirstRun   : ()           => ipcRenderer.invoke('app:isFirstRun'),
  },

  // ── NAS Backup ────────────────────────────────────────────────────────────
  backup: {
    runFull        : (nasPath)          => ipcRenderer.invoke('backup:runFull', nasPath),
    runIncremental : (nasPath)          => ipcRenderer.invoke('backup:runIncremental', nasPath),
    setSchedule    : (schedule, path)   => ipcRenderer.invoke('backup:setSchedule', schedule, path),
    getSchedule    : ()                 => ipcRenderer.invoke('backup:getSchedule'),
    getStatus      : ()                 => ipcRenderer.invoke('backup:getStatus'),
    browsePath     : ()                 => ipcRenderer.invoke('backup:browsePath'),
    onProgress     : (callback)         => {
      ipcRenderer.on('backup:progress', (_, data) => callback(data));
      return () => ipcRenderer.removeAllListeners('backup:progress');
    },
  },

  // ── Drive management ─────────────────────────────────────────────────────
  drive: {
    listRemovable : ()         => ipcRenderer.invoke('drive:listRemovable'),
    getHealth     : ()         => ipcRenderer.invoke('drive:getHealth'),
    safeEject     : (letter)   => ipcRenderer.invoke('drive:safeEject', letter),
    onEjected     : (callback) => {
      ipcRenderer.on('drive:ejected', (_, data) => callback(data));
      return () => ipcRenderer.removeAllListeners('drive:ejected');
    },
  },

  // ── Integrity ────────────────────────────────────────────────────────────
  integrity: {
    spotCheck      : ()         => ipcRenderer.invoke('integrity:spotCheck'),
    deepScan       : ()         => ipcRenderer.invoke('integrity:deepScan'),
    writeManifests : ()         => ipcRenderer.invoke('integrity:writeManifests'),
    takeSnapshot   : ()         => ipcRenderer.invoke('integrity:takeSnapshot'),
    listSnapshots  : ()         => ipcRenderer.invoke('integrity:listSnapshots'),
    getReport      : ()         => ipcRenderer.invoke('integrity:getReport'),
    onProgress     : (callback) => {
      ipcRenderer.on('integrity:progress', (_, data) => callback(data));
      return () => ipcRenderer.removeAllListeners('integrity:progress');
    },
    onReport       : (callback) => {
      ipcRenderer.on('integrity:report', (_, data) => callback(data));
      return () => ipcRenderer.removeAllListeners('integrity:report');
    },
  },

  // ── Settings ─────────────────────────────────────────────────────────────
  settings: {
    get    : (key)         => ipcRenderer.invoke('settings:get', key),
    set    : (key, value)  => ipcRenderer.invoke('settings:set', key, value),
    getAll : ()            => ipcRenderer.invoke('settings:getAll'),
  },

  // ── Dialog helpers ────────────────────────────────────────────────────────
  dialog: {
    openFile : (options) => ipcRenderer.invoke('dialog:openFile', options),
    openDir  : (options) => ipcRenderer.invoke('dialog:openDir', options),
    saveFile : (options) => ipcRenderer.invoke('dialog:saveFile', options),
  },

  // ── Shell ────────────────────────────────────────────────────────────────
  shell: {
    openPath : (filePath) => ipcRenderer.invoke('shell:openPath', filePath),
    openExternal: (url)   => ipcRenderer.invoke('shell:openExternal', url),
  },

  // ── App info ─────────────────────────────────────────────────────────────
  app: {
    version  : () => ipcRenderer.invoke('app:version'),
    dataDir  : () => ipcRenderer.invoke('app:dataDir'),
  },
});
