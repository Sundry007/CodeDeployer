# Contributing to CodeDeployer

Thank you for helping improve CodeDeployer.

## Development Setup

```powershell
npm install
npm run dev
```

Before opening a pull request, run:

```powershell
npm run typecheck
npm run build
```

For Windows installer changes, also run:

```powershell
npm run dist:win
```

## Pull Request Guidelines

- Keep changes focused on one issue or feature.
- Prefer small, readable patches over broad rewrites.
- Follow the existing Electron + React + TypeScript structure.
- Do not commit build output such as `dist/`, `release/`, or `output/`.
- Do not commit real server credentials, private keys, `.env` files, or local
  profile data.
- Include screenshots for UI changes when practical.
- Mention any manual test steps in the pull request description.

## Code Style

- Use TypeScript throughout the main, preload, renderer, and shared layers.
- Keep IPC payloads typed through `src/shared/types.ts`.
- Keep secrets in the main process; do not expose raw secrets to the renderer.
- Prefer SFTP over FTP in new examples and documentation.
- Keep file sync behavior conservative: no remote deletion unless explicitly
  enabled by the user.

## Reporting Issues

Please include:

- Operating system and version.
- CodeDeployer version or commit.
- Protocol used: FTP or SFTP.
- Whether the issue happens in a single mapping or server workspace.
- Relevant transfer log entries, with secrets removed.
- Steps to reproduce.
