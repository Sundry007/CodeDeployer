import { randomUUID } from "node:crypto";
import type { LogEvent, LogLevel, SyncLog } from "../../shared/types";
import { JsonFile } from "./json-file";

interface LogFile {
  logs: SyncLog[];
}

export interface LogInput {
  profileId: string;
  profileName: string;
  level: LogLevel;
  event: LogEvent;
  message: string;
  localPath?: string;
  remotePath?: string;
  error?: string;
}

const MAX_LOGS = 500;

export class LogStore {
  private readonly file: JsonFile<LogFile>;

  constructor(filePath: string) {
    this.file = new JsonFile<LogFile>(filePath, { logs: [] });
  }

  async list(): Promise<SyncLog[]> {
    const data = await this.file.read();
    return data.logs;
  }

  async append(input: LogInput): Promise<SyncLog> {
    const data = await this.file.read();
    const log: SyncLog = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      ...input
    };

    await this.file.write({
      logs: [log, ...data.logs].slice(0, MAX_LOGS)
    });

    return log;
  }
}
