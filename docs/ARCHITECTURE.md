# Architecture

## Recommended Stack

- Electron for desktop shell, tray, startup integration, and packaging.
- TypeScript for main, preload, and renderer code.
- React for the management UI.
- Node.js libraries:
  - `chokidar` for filesystem watching.
  - `ssh2-sftp-client` or `ssh2` for SFTP.
  - `basic-ftp` for FTP.
  - `minimatch` or `picomatch` for ignore rules.
  - `electron-store` for non-secret settings.
  - OS credential storage for secrets when implemented.

## Processes

### Main Process

Responsibilities:

- Load sync profiles.
- Manage tray menu.
- Start and stop watchers.
- Own upload queues.
- Communicate with renderer over IPC.
- Persist logs.
- Start on login.

### Renderer

Responsibilities:

- Profile management UI.
- Mapping table.
- Status and logs display.
- Manual sync trigger.

### Sync Worker

Can initially run in the main process. If sync grows heavy, move to worker threads or a separate Node child process.

## Sync Pipeline

1. Watch local directory.
2. Debounce events per path.
3. Apply ignore rules.
4. Convert local path to remote path.
5. Ensure remote parent directory exists.
6. Upload to temporary remote path.
7. Rename temporary remote path to final path.
8. Record success or failure.
9. Retry failures with backoff.

## Upload Safety

Use temporary remote files:

```text
target.php.__codedeployer_tmp__
```

After upload completes, rename the temporary file to the target path.

## Profile Shape

```json
{
  "id": "profile-id",
  "name": "Example Web App",
  "enabled": true,
  "localPath": "E:\\Workspace\\example-web-app",
  "remote": {
    "protocol": "sftp",
    "host": "203.0.113.10",
    "port": 22,
    "username": "deploy",
    "authMode": "privateKey",
    "remotePath": "/var/www/example-web-app"
  },
  "ignore": [
    ".git/",
    "node_modules/",
    "dist/",
    "build/",
    ".env"
  ],
  "deleteRemote": false,
  "concurrency": 2
}
```

## Open Questions

- Whether to add FTPS support in addition to plain FTP and SFTP.
- Whether first version should include remote directory browsing.
- Whether remote deletion should be supported in MVP or delayed.
