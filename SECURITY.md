# Security Policy

CodeDeployer handles server connection details and deployment paths, so security
reports are welcome.

## Supported Versions

The project is currently in early prototype status. Security fixes should target
the latest `main` branch unless release branches are introduced later.

## Reporting a Vulnerability

Please open a GitHub issue if the report does not include sensitive exploit
details. For sensitive reports, contact the maintainer privately once a contact
method is published in the repository profile or release page.

When reporting, include:

- Affected version or commit.
- Operating system.
- Protocol used: FTP or SFTP.
- Whether credentials, file permissions, or remote paths are affected.
- Minimal reproduction steps.

Do not include real passwords, private keys, API tokens, or production server
addresses in public issues.

## Credential Handling

- Saved passwords and private-key passphrases are encrypted with Electron
  `safeStorage`.
- The renderer process should only know whether a secret is configured; raw
  secret values should remain in the main process.
- Example config files must never contain real credentials.

## Deployment Safety

- SFTP is recommended over FTP.
- Remote deletion should remain opt-in.
- Ignore rules should exclude `.env`, private keys, dependency directories,
  build output, logs, and cache folders by default.
- When SFTP replaces an existing remote file, CodeDeployer attempts to preserve
  the original owner, group, and permissions if the server allows it.
