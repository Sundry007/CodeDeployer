import { promises as fs } from "node:fs";
import path from "node:path";

export class JsonFile<T> {
  constructor(
    private readonly filePath: string,
    private readonly fallback: T
  ) {}

  async read(): Promise<T> {
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      return JSON.parse(raw) as T;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return this.fallback;
      }

      throw error;
    }
  }

  async write(value: T): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");

    try {
      await retryFileOperation(() => fs.rename(tempPath, this.filePath));
    } catch (error) {
      await fs.rm(tempPath, { force: true });
      throw error;
    }
  }
}

async function retryFileOperation(operation: () => Promise<void>, attempts = 6): Promise<void> {
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await operation();
      return;
    } catch (error) {
      lastError = error;

      if (!isRetryableFileError(error) || attempt === attempts - 1) {
        break;
      }

      await sleep(60 * (attempt + 1));
    }
  }

  throw lastError;
}

function isRetryableFileError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code;
  return code === "EPERM" || code === "EBUSY" || code === "EACCES";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
