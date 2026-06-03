# CodeDeployer Agent Notes

## Goal

Build a desktop app that automatically syncs local development folders to server directories over FTP or SSH/SFTP.

## Product Principles

- Configuration should happen rarely; daily operation should be automatic.
- The UI should clearly show each mapping: local path, server, remote path, status, and recent activity.
- Default sync behavior is local-to-remote overwrite without deleting remote-only files.
- Support FTP and SFTP; prefer SFTP over SSH when the server supports it.
- Keep secrets out of plain config files when implementing the app.

## Technical Direction

- Prefer Electron + Node.js + TypeScript so Windows and macOS can share the same codebase.
- Use a background main process and tray integration.
- Use a renderer UI for configuration and logs.
- Use an upload queue with debounce to avoid uploading files while the editor/build tool is still writing.
- Use temporary remote upload paths followed by rename for safer overwrites.

## Safety

- Do not sync `.env`, private keys, dependency folders, build folders, logs, or cache folders by default.
- Do not delete remote files unless the user explicitly enables deletion for a profile.
- Prefer SSH key authentication over passwords for SFTP profiles.
