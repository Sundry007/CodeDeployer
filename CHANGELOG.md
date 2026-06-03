# Changelog

All notable changes to CodeDeployer will be documented in this file.

## [0.1.0] - 2026-06-03

### Added

- Initial Electron + React + TypeScript desktop app for local-to-server deployment.
- Profile management UI with bilingual Chinese / English labels.
- SFTP connection testing, remote directory browsing, and local directory/private key pickers.
- Background file watching with upload queue debounce.
- One-way local-to-remote SFTP uploads with temporary remote files and rename-based overwrite.
- Transfer log panel and persisted local logs.
- Tray integration: closing the main window hides it while enabled mappings keep syncing.
- macOS packaging with `electron-builder` for Apple Silicon and Intel Macs.

### Fixed

- Fixed packaged macOS white screen by using relative Vite renderer asset paths.
- Fixed missing `remote.protocol` handling when saving and submitting profiles.
- Excluded optional native SSH acceleration modules from packaged builds to avoid Electron ABI rebuild failures.

### Release Artifacts

- `CodeDeployer-0.1.0-mac-arm64.dmg`
- `CodeDeployer-0.1.0-mac-arm64.zip`
- `CodeDeployer-0.1.0-mac-x64.dmg`
- `CodeDeployer-0.1.0-mac-x64.zip`

### Notes

- macOS builds are unsigned and not notarized. First launch may require right-clicking the app and choosing Open.
- Windows packaging is still pending.
