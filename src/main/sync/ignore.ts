import path from "node:path";
import picomatch from "picomatch";

export function createIgnoreMatcher(rootPath: string, rules: string[]): (filePath: string) => boolean {
  const normalizedRoot = path.resolve(rootPath);
  const patterns = expandPatterns(rules);
  const matcher = picomatch(patterns, { dot: true });

  return (filePath: string) => {
    const relativePath = path.relative(normalizedRoot, path.resolve(filePath));

    if (!relativePath || relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
      return false;
    }

    return matcher(toPosixPath(relativePath));
  };
}

function expandPatterns(rules: string[]): string[] {
  return rules.flatMap((rule) => {
    const clean = rule.trim().replace(/\\/g, "/").replace(/^\/+/, "");

    if (!clean) {
      return [];
    }

    if (clean.endsWith("/")) {
      const directory = clean.replace(/\/+$/, "");
      return [directory, `${directory}/**`, `**/${directory}`, `**/${directory}/**`];
    }

    return [clean, `**/${clean}`];
  });
}

export function toPosixPath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}
