# Source Layout

Current Phase 1 layout:

```text
src/
  main/
    app.ts
    storage/
      json-file.ts
      log-store.ts
      profile-store.ts
      secret-store.ts
    sync/
      ftp-client.ts
      ignore.ts
      remote-path.ts
      sftp-client.ts
      sync-manager.ts
      transfer-client.ts
      upload-queue.ts
  preload/
    index.ts
  renderer/
    App.tsx
    main.tsx
    styles.css
  shared/
    types.ts
```

The sync worker currently runs inside the Electron main process. FTP and SFTP operations are routed through `transfer-client.ts`. Profiles and logs are stored as JSON under Electron's `userData` directory; passwords and key passphrases are stored separately with `safeStorage`.
