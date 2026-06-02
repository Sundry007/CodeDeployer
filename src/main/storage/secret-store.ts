import { safeStorage } from "electron";
import type { ProfileSecretInput } from "../../shared/types";
import { JsonFile } from "./json-file";

interface SecretFile {
  profiles: Record<string, string>;
}

export class SecretStore {
  private readonly file: JsonFile<SecretFile>;

  constructor(filePath: string) {
    this.file = new JsonFile<SecretFile>(filePath, { profiles: {} });
  }

  async get(profileId: string): Promise<ProfileSecretInput> {
    const data = await this.file.read();
    const encrypted = data.profiles[profileId];

    if (!encrypted) {
      return {};
    }

    try {
      const decrypted = safeStorage.decryptString(Buffer.from(encrypted, "base64"));
      return JSON.parse(decrypted) as ProfileSecretInput;
    } catch {
      return {};
    }
  }

  async save(profileId: string, input?: ProfileSecretInput): Promise<void> {
    const nextSecret = compactSecret(input);

    if (!nextSecret) {
      return;
    }

    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error("Credential encryption is not available on this system.");
    }

    const data = await this.file.read();
    const existing = await this.get(profileId);
    const encrypted = safeStorage
      .encryptString(JSON.stringify({ ...existing, ...nextSecret }))
      .toString("base64");

    await this.file.write({
      profiles: {
        ...data.profiles,
        [profileId]: encrypted
      }
    });
  }

  async delete(profileId: string): Promise<void> {
    const data = await this.file.read();
    const { [profileId]: _removed, ...profiles } = data.profiles;
    await this.file.write({ profiles });
  }
}

function compactSecret(input?: ProfileSecretInput): ProfileSecretInput | undefined {
  const password = input?.password?.trim();
  const privateKeyPassphrase = input?.privateKeyPassphrase?.trim();

  if (!password && !privateKeyPassphrase) {
    return undefined;
  }

  return {
    ...(password ? { password } : {}),
    ...(privateKeyPassphrase ? { privateKeyPassphrase } : {})
  };
}
