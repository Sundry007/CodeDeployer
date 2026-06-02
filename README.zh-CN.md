# CodeDeployer

![CodeDeployer logo](assets/codedeployer-logo.svg)

CodeDeployer 是一个面向开发者的桌面部署助手，用来把本地代码目录的变更自动上传到服务器目录。

[English README](README.md)

> 当前状态：Windows 优先的早期原型。功能已经可用，但如果要用于关键生产系统，还需要更多稳定性、签名、权限和异常处理方面的加固。

## 它能做什么

- 监听本地项目目录，文件变更后自动上传。
- 支持 FTP 和 SFTP，推荐优先使用 SFTP。
- 支持“服务器工作区”：一台服务器下管理多个本地目录和远程目录映射。
- 仍保留单独的目录映射模式。
- 本地目录和服务器目录都可以通过选择器浏览选择。
- 支持手动立即上传同步。
- 支持远程下载：扫描本地和远程目录差异，选择后下载到本地。
- 右侧传输日志展示上传、下载、连接测试等操作记录。
- 每个目录映射拥有独立忽略规则。
- 使用 Electron `safeStorage` 保存密码和密钥口令。
- 关闭窗口后可继续在托盘后台运行。
- 支持中文和英文界面切换。

## 安全默认策略

CodeDeployer 默认按“源代码部署”场景设计：

- 默认不删除服务器上的文件。
- 默认忽略 `.git/`、依赖目录、构建目录、日志、压缩包、`.env`、私钥等非源代码内容。
- SFTP 上传使用“临时文件上传完成后 rename 覆盖”的方式，减少半截文件出现在服务器上的风险。
- 覆盖远端已有 SFTP 文件时，会尽量保留原文件的属主、属组和权限；如果服务器不允许当前账号执行 `chown`，则无法强制恢复属主。

## 安装

发布正式版本后，可以从 GitHub Releases 下载 Windows 安装包。

本地打包：

```powershell
npm install
npm run dist:win
```

安装包会生成在 `release/` 目录。

## 本地开发

建议环境：

- Node.js 20 或更新版本。
- Windows 是当前主要开发目标。

常用命令：

```powershell
npm install
npm run dev
npm run typecheck
npm run build
npm run icons
npm run dist:win
```

命令说明：

- `npm run dev` 启动 Vite 前端和 Electron 应用。
- `npm run typecheck` 检查主进程、preload、渲染进程 TypeScript 类型。
- `npm run build` 构建生产版本。
- `npm run icons` 重新生成应用图标。
- `npm run dist:win` 生成 Windows x64 NSIS 安装包。
- `npm run pack:win` 生成未打包的 Windows 应用目录，便于本地快速检查。

## 项目结构

```text
src/main/       Electron 主进程、存储、传输、托盘、IPC
src/preload/    安全的 renderer-to-main 桥接层
src/renderer/   React 界面
src/shared/     前后端共享 TypeScript 类型
assets/         应用图标和品牌资源
docs/           产品、架构、路线图文档
scripts/        图标生成和 Windows 打包脚本
config/         示例配置
```

## 配置说明

- 目录映射和服务器工作区存储在 Electron 的 `userData` 目录。
- 传输日志以 `logs.json` 形式存储在 Electron 的 `userData` 目录。
- 密码和密钥口令通过 Electron `safeStorage` 加密保存。
- 忽略规则按每个目录映射独立配置。
- FTP 用于兼容旧服务器，日常部署建议使用 SFTP。

## 文档

- [产品说明](docs/PRODUCT_SPEC.md)
- [架构说明](docs/ARCHITECTURE.md)
- [路线图](docs/ROADMAP.md)
- [贡献指南](CONTRIBUTING.md)
- [安全说明](SECURITY.md)

## 参与贡献

欢迎提交 issue 和 pull request。提交代码前请先阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 开源许可

CodeDeployer 基于 [MIT License](LICENSE) 开源。
