# Product Spec

## Background

The user often debugs local code and wants changed local files to automatically cover files under specific server directories. The old FTP-based workflow frequently reports directory/file-name conflicts and requires too much manual attention.

## Target User

A developer maintaining multiple local projects and remote server directories on Windows now, with macOS support desired later.

## Core Requirements

- Automatically start when the computer boots.
- Run in the background without manual daily operation.
- Provide a desktop management UI for initial setup and occasional changes.
- Display mappings clearly:
  - Local directory
  - Server host
  - Remote directory
  - Status
  - Last sync time
- Support multiple mappings.
- Support ignore rules per mapping.
- Support both FTP and SFTP/SSH, with SFTP recommended by default.
- Upload local changes automatically.
- Support manual "sync now" for a mapping.
- Show recent success and failure logs.

## Default Sync Behavior

- Direction: local to remote.
- New local file: upload.
- Modified local file: overwrite remote.
- New local directory: create remote directory.
- Deleted local file: do not delete remote by default.
- Remote-only file: leave untouched by default.

Remote deletion can be added as an explicit opt-in setting.

## Default Ignore Rules

```text
.git/
node_modules/
dist/
build/
.next/
.nuxt/
vendor/
coverage/
.cache/
storage/logs/
*.log
.env
.env.*
*.pem
*.key
```

## MVP Screens

### Dashboard

Mapping list:

```text
Status   Name                 Local Path                  Remote Target
Running  Example API          E:\Workspace\example-api    203.0.113.10:/var/www/example-api
Paused   Example Frontend     E:\Workspace\example-web    203.0.113.10:/var/www/example-web
```

Actions:

- Add mapping
- Edit mapping
- Pause/resume
- Sync now
- View logs

### Mapping Editor

Fields:

- Name
- Local directory
- Host
- Port
- Username
- Protocol
- Auth mode
- Password or private key path
- Remote directory
- Ignore rules
- Enable on startup
- Enable delete remote files, off by default

### Logs

Show:

- Timestamp
- Mapping name
- Event type
- File path
- Result
- Error message, if any

## Nice-to-Have Later

- macOS build.
- SSH key generation helper.
- Test connection button.
- Remote directory browser.
- Export/import profiles.
- Conflict preview before enabling remote deletion.
- Lightweight web dashboard.
