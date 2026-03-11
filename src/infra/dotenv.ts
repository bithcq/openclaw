import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { resolveConfigDir } from "../utils.js";

function resolveEntrypointProjectEnvPath(): string | null {
  const entrypoint = process.argv[1]?.trim();
  if (!entrypoint) {
    return null;
  }

  const entrypointDir = path.dirname(path.resolve(entrypoint));
  const dirName = path.basename(entrypointDir);
  if (dirName !== "dist" && dirName !== "src") {
    return null;
  }

  const candidate = path.join(path.dirname(entrypointDir), ".env");
  return fs.existsSync(candidate) ? candidate : null;
}

export function loadDotEnv(opts?: { quiet?: boolean }) {
  const quiet = opts?.quiet ?? true;

  // Load from process CWD first (dotenv default).
  dotenv.config({ quiet });

  // Service installs often launch `node /path/to/openclaw/dist/index.js` without
  // setting CWD to the project root. In that case, still honor a repo/package
  // adjacent `.env` such as `/home/user/openclaw/.env`.
  const entrypointEnvPath = resolveEntrypointProjectEnvPath();
  const cwdEnvPath = path.join(process.cwd(), ".env");
  if (entrypointEnvPath && path.resolve(entrypointEnvPath) !== path.resolve(cwdEnvPath)) {
    dotenv.config({ quiet, path: entrypointEnvPath, override: false });
  }

  // Then load global fallback: ~/.openclaw/.env (or OPENCLAW_STATE_DIR/.env),
  // without overriding any env vars already present.
  const globalEnvPath = path.join(resolveConfigDir(process.env), ".env");
  if (!fs.existsSync(globalEnvPath)) {
    return;
  }

  dotenv.config({ quiet, path: globalEnvPath, override: false });
}
