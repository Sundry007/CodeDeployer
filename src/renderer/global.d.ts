import type { CodeDeployerApi } from "../shared/types";

declare global {
  interface Window {
    codedeployer: CodeDeployerApi;
  }
}

export {};
