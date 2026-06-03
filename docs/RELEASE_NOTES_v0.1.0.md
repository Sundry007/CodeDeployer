# CodeDeployer v0.1.0

Initial internal release of CodeDeployer, a desktop app for automatically syncing local development folders to server directories over SFTP.

## Highlights

- Configure local-to-remote mappings in a bilingual desktop UI.
- Browse local folders, SSH private key files, and remote server directories.
- Test SFTP connections before saving.
- Keep enabled mappings syncing in the background after closing the main window.
- View recent transfer activity in the app.
- Package macOS builds for Apple Silicon and Intel Macs.

## macOS Downloads

- `CodeDeployer-0.1.0-mac-arm64.dmg` for Apple Silicon Macs.
- `CodeDeployer-0.1.0-mac-x64.dmg` for Intel Macs.
- ZIP builds are also available for both architectures.

## Checksums

```text
42a1838655c77212b3472f374ac44b492eec86ad247fcc2379aaa69bbee6034d  CodeDeployer-0.1.0-mac-arm64.dmg
348e66369d766ad801a005e1831585756b2dd15f18bf373f5433cb636ba3ea76  CodeDeployer-0.1.0-mac-arm64.zip
199c6cdb03a9dd3c17390ac5616ae81accf243ebac3d6c8bc426ea229c58f397  CodeDeployer-0.1.0-mac-x64.dmg
9755b4d614f4ddbd2bbc9cd155ab818ec360184c83a022a2aa8f30239585e65a  CodeDeployer-0.1.0-mac-x64.zip
```

## Known Limitations

- macOS builds are unsigned and not notarized.
- Windows installer packaging is not published yet.
- The current sync direction is local-to-remote upload only.
