/**
 * Memory Host - QMD Process
 */

import { spawn } from "node:child_process";

export async function runCommand(params: {
  command: string;
  args: string[];
  cwd?: string;
  timeoutMs?: number;
}): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(params.command, params.args, {
      cwd: params.cwd || process.cwd(),
      stdio: "pipe",
    });

    let stdout = "";
    let stderr = "";
    let timer: NodeJS.Timeout;

    if (params.timeoutMs) {
      timer = setTimeout(() => {
        child.kill();
        reject(new Error(`Command timed out after ${params.timeoutMs}ms`));
      }, params.timeoutMs);
    }

    child.stdout.on("data", (data) => { stdout += data.toString(); });
    child.stderr.on("data", (data) => { stderr += data.toString(); });

    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`Command failed with code ${code}: ${stderr || stdout}`));
      }
    });

    child.on("error", (err) => {
      if (timer) clearTimeout(timer);
      reject(err);
    });
  });
}