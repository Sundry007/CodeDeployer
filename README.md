# CodeDeployer

![CodeDeployer logo](assets/codedeployer-logo.svg)

CodeDeployer is a desktop deployment assistant for developers who want local code
changes to be uploaded automatically to one or more server directories.

[中文说明](README.zh-CN.md)

> Status: early Windows-focused prototype. The app is usable, but still needs
> more production hardening before it should be treated as unattended deployment
> infrastructure for critical systems.

## What It Does

- Watches local project folders and uploads changed files automatically.
- Supports FTP and SFTP, with SFTP recommended.
- Groups multiple directory mappings under one server workspace.
- Supports one local directory mapped to one remote directory, or one server
  workspace with many directory rules.
- Lets users browse local and remote directories instead of typing paths only.
- Provides manual upload sync and remote-to-local download comparison.
- Keeps upload/download activity in the transfer log panel.
- Supports per-mapping ignore rules for source-safe deployment.
- Stores saved passwords and key passphrases with Electron `safeStorage`.
- Runs in the tray so enabled watchers can continue after closing the window.
- Provides Chinese and English UI language switching.

## Safety Defaults

CodeDeployer is designed for source-code deployment workflows:

- Remote files are not deleted by default.
- Common non-source files are ignored, including `.git/`, dependencies, build
  output, logs, archives, `.env` files, and private keys.
- SFTP uploads use a temporary remote file and then rename it into place.
- When replacing an existing SFTP file, the app tries to preserve the original
  remote file owner, group, and permissions if the server allows it.

## Install

Download the Windows installer from the project releases page when releases are
published.

For a local build:

```powershell
npm install
npm run dist:win
```

The installer is generated under `release/`.

## Development

Requirements:

- Node.js 20 or newer is recommended.
- Windows is the primary development target.

Commands:

```powershell
npm install
npm run dev
npm run typecheck
npm run build
npm run icons
npm run dist:win
```

Command reference:

- `npm run dev` starts the Vite renderer and Electron app.
- `npm run typecheck` checks both main/preload and renderer TypeScript.
- `npm run build` creates the production Electron and renderer bundles.
- `npm run icons` regenerates the app icons from the source asset.
- `npm run dist:win` creates a Windows x64 NSIS installer.
- `npm run pack:win` creates an unpacked Windows app for quick local checks.

## Project Structure

```text
src/main/       Electron main process, storage, transfer, tray, IPC
src/preload/    Safe renderer-to-main bridge
src/renderer/   React UI
src/shared/     Shared TypeScript types
assets/         App icon and brand assets
docs/           Product, architecture, and roadmap notes
scripts/        Icon generation and Windows packaging scripts
config/         Example profile configuration
```

## Configuration Notes

- Profiles and workspaces are stored in Electron's `userData` directory.
- Transfer logs are stored as `logs.json` in Electron's `userData` directory.
- Passwords and key passphrases are encrypted through Electron `safeStorage`.
- Ignore rules are configured independently for each mapping.
- FTP is supported for compatibility, but SFTP is the recommended protocol.

## Documentation

- [Product Spec](docs/PRODUCT_SPEC.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Roadmap](docs/ROADMAP.md)
- [Contributing](CONTRIBUTING.md)
- [Security](SECURITY.md)

## Contributing

Issues and pull requests are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md)
before submitting changes.

## License

CodeDeployer is released under the [MIT License](LICENSE).
