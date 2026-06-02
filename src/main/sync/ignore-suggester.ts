import { promises as fs, type Dirent } from "node:fs";
import path from "node:path";
import type { IgnoreRuleScanResult, IgnoreRuleSuggestion } from "../../shared/types";
import { toPosixPath } from "./ignore";

const MAX_DEPTH = 4;
const MAX_ENTRIES = 5000;

const DIRECTORY_RULES: Record<string, string> = {
  ".git": "Git metadata",
  ".hg": "Mercurial metadata",
  ".svn": "Subversion metadata",
  "node_modules": "Node dependencies",
  "vendor": "Dependency directory",
  "bower_components": "Frontend dependencies",
  "packages": "Dependency/package cache",
  "dist": "Build output",
  "build": "Build output",
  "out": "Build output",
  ".next": "Next.js build output",
  ".nuxt": "Nuxt build output",
  ".svelte-kit": "SvelteKit build output",
  ".vite": "Vite cache",
  ".turbo": "Turbo cache",
  ".parcel-cache": "Parcel cache",
  ".cache": "Cache directory",
  ".pytest_cache": "Pytest cache",
  ".mypy_cache": "Mypy cache",
  "__pycache__": "Python bytecode cache",
  ".gradle": "Gradle cache",
  "target": "Build output",
  "coverage": "Coverage output",
  ".idea": "IDE metadata",
  ".vscode": "Editor metadata",
  "logs": "Log directory",
  "tmp": "Temporary directory",
  "temp": "Temporary directory"
};

const FILE_RULES: Array<{ pattern: RegExp; rule: string; reason: string }> = [
  { pattern: /^\.DS_Store$/i, rule: ".DS_Store", reason: "macOS system file" },
  { pattern: /^Thumbs\.db$/i, rule: "Thumbs.db", reason: "Windows thumbnail cache" },
  { pattern: /^desktop\.ini$/i, rule: "desktop.ini", reason: "Windows folder metadata" },
  { pattern: /^\.env(?:\..*)?$/i, rule: ".env*", reason: "Environment secrets" },
  { pattern: /\.(?:pem|key|p12|pfx|crt|cer)$/i, rule: "*.{pem,key,p12,pfx,crt,cer}", reason: "Certificate or private key file" },
  { pattern: /\.(?:log)$/i, rule: "*.log", reason: "Log file" },
  { pattern: /\.(?:zip|rar|7z|tar|gz|tgz|bz2|xz)$/i, rule: "*.{zip,rar,7z,tar,gz,tgz,bz2,xz}", reason: "Archive file" },
  { pattern: /\.(?:tmp|temp|swp|swo)$/i, rule: "*.{tmp,temp,swp,swo}", reason: "Temporary editor file" },
  { pattern: /^npm-debug\.log$/i, rule: "npm-debug.log", reason: "Package manager log" },
  { pattern: /^yarn-error\.log$/i, rule: "yarn-error.log", reason: "Package manager log" },
  { pattern: /^pnpm-debug\.log$/i, rule: "pnpm-debug.log", reason: "Package manager log" }
];

export async function suggestIgnoreRules(localPath: string): Promise<IgnoreRuleScanResult> {
  const rootPath = path.resolve(localPath);
  const suggestions = new Map<string, IgnoreRuleSuggestion>();
  let seenEntries = 0;

  async function visit(currentPath: string, depth: number): Promise<void> {
    if (depth > MAX_DEPTH || seenEntries > MAX_ENTRIES) {
      return;
    }

    let entries: Dirent<string>[];

    try {
      entries = await fs.readdir(currentPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      seenEntries += 1;

      if (seenEntries > MAX_ENTRIES) {
        return;
      }

      const entryPath = path.join(currentPath, entry.name);
      const relativePath = toPosixPath(path.relative(rootPath, entryPath));

      if (entry.isDirectory()) {
        const directoryRule = DIRECTORY_RULES[entry.name];

        if (directoryRule) {
          addSuggestion(suggestions, `${relativePath}/`, directoryRule);
          continue;
        }

        await visit(entryPath, depth + 1);
        continue;
      }

      if (entry.isFile()) {
        for (const fileRule of FILE_RULES) {
          if (fileRule.pattern.test(entry.name)) {
            addSuggestion(suggestions, fileRule.rule, fileRule.reason);
          }
        }
      }
    }
  }

  await visit(rootPath, 0);

  return {
    rootPath,
    suggestions: Array.from(suggestions.values()).sort((left, right) => left.rule.localeCompare(right.rule))
  };
}

function addSuggestion(
  suggestions: Map<string, IgnoreRuleSuggestion>,
  rule: string,
  reason: string
): void {
  if (!suggestions.has(rule)) {
    suggestions.set(rule, { rule, reason });
  }
}
