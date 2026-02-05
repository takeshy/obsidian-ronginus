/**
 * CLI Provider for Ronginus
 * Handles execution of Gemini CLI, Claude CLI, and Codex CLI
 */

import { Platform } from "obsidian";
import type { CliType, Message, StreamChunk } from "../types";

// Type for ChildProcess (avoid static import)
type ChildProcessType = import("child_process").ChildProcess;

/**
 * Load child_process on desktop only.
 */
function getChildProcess(): typeof import("child_process") {
  const loader =
    (globalThis as unknown as { require?: (id: string) => unknown }).require ||
    (globalThis as unknown as { module?: { require?: (id: string) => unknown } }).module?.require;
  if (!loader) {
    throw new Error("child_process is not available in this environment");
  }
  return loader("child_process") as typeof import("child_process");
}

/**
 * Check if running on Windows
 */
export function isWindows(): boolean {
  if (Platform.isMobile) return false;
  return typeof process !== "undefined" && process.platform === "win32";
}

/**
 * Check if a file exists (synchronously)
 */
function fileExistsSync(path: string): boolean {
  try {
    const loader =
      (globalThis as unknown as { require?: (id: string) => unknown }).require ||
      (globalThis as unknown as { module?: { require?: (id: string) => unknown } }).module?.require;
    if (!loader) return false;
    const fs = loader("fs") as typeof import("fs");
    return fs.existsSync(path);
  } catch {
    return false;
  }
}

/**
 * Get candidate Windows npm global node_modules paths
 */
function getWindowsNpmPaths(): string[] {
  if (!isWindows() || typeof process === "undefined") return [];

  const paths: string[] = [];
  const env = process.env;

  if (env?.APPDATA) {
    paths.push(`${env.APPDATA}\\npm\\node_modules`);
  }
  if (env?.PROGRAMFILES) {
    paths.push(`${env.PROGRAMFILES}\\nodejs\\node_modules`);
  }
  const programFilesX86 = env?.["PROGRAMFILES(X86)"];
  if (programFilesX86) {
    paths.push(`${programFilesX86}\\nodejs\\node_modules`);
  }
  if (env?.PATH) {
    const pathDirs = env.PATH.split(";");
    for (const dir of pathDirs) {
      if (!dir) continue;
      if (fileExistsSync(`${dir}\\node.exe`)) {
        paths.push(`${dir}\\node_modules`);
      }
      if (dir.toLowerCase().includes("npm") && fileExistsSync(`${dir}\\node_modules`)) {
        paths.push(`${dir}\\node_modules`);
      }
    }
  }

  return [...new Set(paths)];
}

/**
 * Find a Windows npm package script
 */
function findWindowsNpmScript(packagePath: string): string | undefined {
  const npmPaths = getWindowsNpmPaths();
  for (const npmPath of npmPaths) {
    const scriptPath = `${npmPath}\\${packagePath}`;
    if (fileExistsSync(scriptPath)) {
      return scriptPath;
    }
  }
  return undefined;
}

/**
 * Resolve CLI commands for each provider
 */
function resolveGeminiCommand(args: string[], customPath?: string): { command: string; args: string[] } {
  if (customPath && fileExistsSync(customPath)) {
    if (isWindows()) {
      return { command: "node", args: [customPath, ...args] };
    }
    return { command: customPath, args };
  }

  if (isWindows()) {
    const scriptPath = findWindowsNpmScript("@google\\gemini-cli\\dist\\index.js");
    if (scriptPath) {
      return { command: "node", args: [scriptPath, ...args] };
    }
    const appdata = process.env?.APPDATA;
    const fallbackPath = appdata
      ? `${appdata}\\npm\\node_modules\\@google\\gemini-cli\\dist\\index.js`
      : "@google\\gemini-cli\\dist\\index.js";
    return { command: "node", args: [fallbackPath, ...args] };
  }

  return { command: "gemini", args };
}

function resolveClaudeCommand(args: string[], customPath?: string): { command: string; args: string[] } {
  if (customPath && fileExistsSync(customPath)) {
    if (isWindows()) {
      if (customPath.toLowerCase().endsWith(".exe")) {
        return { command: customPath, args };
      }
      return { command: "node", args: [customPath, ...args] };
    }
    return { command: customPath, args };
  }

  if (isWindows() && typeof process !== "undefined") {
    const scriptPath = findWindowsNpmScript("@anthropic-ai\\claude-code\\cli.js");
    if (scriptPath) {
      return { command: "node", args: [scriptPath, ...args] };
    }
    const localAppdata = process.env?.LOCALAPPDATA;
    if (localAppdata) {
      const exePath = `${localAppdata}\\Programs\\claude\\claude.exe`;
      if (fileExistsSync(exePath)) {
        return { command: exePath, args };
      }
    }
    const appdata = process.env?.APPDATA;
    const fallbackPath = appdata
      ? `${appdata}\\npm\\node_modules\\@anthropic-ai\\claude-code\\cli.js`
      : "@anthropic-ai\\claude-code\\cli.js";
    return { command: "node", args: [fallbackPath, ...args] };
  }

  // Non-Windows: check common installation paths
  if (typeof process !== "undefined") {
    const home = process.env?.HOME;
    const candidatePaths: string[] = [];
    if (home) {
      candidatePaths.push(`${home}/.local/bin/claude`);
      candidatePaths.push(`${home}/.npm-global/bin/claude`);
    }
    candidatePaths.push("/opt/homebrew/bin/claude");
    candidatePaths.push("/usr/local/bin/claude");

    for (const path of candidatePaths) {
      if (fileExistsSync(path)) {
        return { command: path, args };
      }
    }
  }

  return { command: "claude", args };
}

function resolveCodexCommand(args: string[], customPath?: string): { command: string; args: string[] } {
  if (customPath && fileExistsSync(customPath)) {
    if (isWindows()) {
      return { command: "node", args: [customPath, ...args] };
    }
    return { command: customPath, args };
  }

  if (isWindows()) {
    const scriptPath = findWindowsNpmScript("@openai\\codex\\bin\\codex.js");
    if (scriptPath) {
      return { command: "node", args: [scriptPath, ...args] };
    }
    const appdata = process.env?.APPDATA;
    const fallbackPath = appdata
      ? `${appdata}\\npm\\node_modules\\@openai\\codex\\bin\\codex.js`
      : "@openai\\codex\\bin\\codex.js";
    return { command: "node", args: [fallbackPath, ...args] };
  }

  return { command: "codex", args };
}

/**
 * Format conversation history as a prompt string
 */
function formatHistoryAsPrompt(messages: Message[], systemPrompt: string): string {
  const parts: string[] = [];

  if (systemPrompt) {
    parts.push(`System: ${systemPrompt}\n`);
  }

  for (let i = 0; i < messages.length - 1; i++) {
    const msg = messages[i];
    const role = msg.role === "user" ? "User" : "Assistant";
    parts.push(`${role}: ${msg.content}\n`);
  }

  const lastMessage = messages[messages.length - 1];
  if (lastMessage && lastMessage.role === "user") {
    parts.push(`User: ${lastMessage.content}`);
  }

  return parts.join("\n");
}

export interface CliProviderInterface {
  name: CliType;
  displayName: string;
  isAvailable(): Promise<boolean>;
  chat(
    messages: Message[],
    systemPrompt: string,
    workingDirectory: string,
    signal?: AbortSignal
  ): Promise<string>;
  chatStream(
    messages: Message[],
    systemPrompt: string,
    workingDirectory: string,
    signal?: AbortSignal
  ): AsyncGenerator<StreamChunk>;
}

/**
 * Base CLI provider class
 */
abstract class BaseCliProvider implements CliProviderInterface {
  abstract name: CliType;
  abstract displayName: string;

  protected abstract resolveVersionCommand(): { command: string; args: string[] };

  async isAvailable(): Promise<boolean> {
    if (Platform.isMobile) {
      return false;
    }

    try {
      const { spawn } = getChildProcess();
      const { command, args } = this.resolveVersionCommand();

      return new Promise((resolve) => {
        try {
          const proc = spawn(command, args, {
            stdio: ["pipe", "pipe", "pipe"],
            shell: false,
            env: typeof process !== "undefined" ? process.env : undefined,
          });

          proc.on("close", (code: number | null) => {
            resolve(code === 0);
          });

          proc.on("error", () => {
            resolve(false);
          });

          setTimeout(() => {
            proc.kill();
            resolve(false);
          }, 30000);
        } catch {
          resolve(false);
        }
      });
    } catch {
      return false;
    }
  }

  async chat(
    messages: Message[],
    systemPrompt: string,
    workingDirectory: string,
    signal?: AbortSignal
  ): Promise<string> {
    let result = "";
    for await (const chunk of this.chatStream(messages, systemPrompt, workingDirectory, signal)) {
      if (chunk.type === "text" && chunk.content) {
        result += chunk.content;
      } else if (chunk.type === "error" && chunk.error) {
        throw new Error(chunk.error);
      }
    }
    return result;
  }

  abstract chatStream(
    messages: Message[],
    systemPrompt: string,
    workingDirectory: string,
    signal?: AbortSignal
  ): AsyncGenerator<StreamChunk>;

  protected async collectStderr(proc: ChildProcessType): Promise<string> {
    if (!proc.stderr) return "";
    let stderr = "";
    proc.stderr.setEncoding("utf8");
    for await (const chunk of proc.stderr) {
      stderr += chunk;
    }
    return stderr;
  }

  protected async waitForClose(proc: ChildProcessType): Promise<number | null> {
    return new Promise((resolve, reject) => {
      proc.on("close", (code: number | null) => resolve(code));
      proc.on("error", reject);
    });
  }
}

/**
 * Gemini CLI provider
 */
export class GeminiCliProvider extends BaseCliProvider {
  name: CliType = "gemini-cli";
  displayName = "Gemini";
  private customPath?: string;

  constructor(customPath?: string) {
    super();
    this.customPath = customPath;
  }

  protected resolveVersionCommand(): { command: string; args: string[] } {
    return resolveGeminiCommand(["--version"], this.customPath);
  }

  async *chatStream(
    messages: Message[],
    systemPrompt: string,
    workingDirectory: string,
    signal?: AbortSignal
  ): AsyncGenerator<StreamChunk> {
    const { spawn } = getChildProcess();
    const prompt = formatHistoryAsPrompt(messages, systemPrompt);
    const { command, args } = resolveGeminiCommand(["-p", prompt], this.customPath);

    const proc = spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
      cwd: workingDirectory || undefined,
      env: typeof process !== "undefined" ? process.env : undefined,
    });

    if (signal) {
      signal.addEventListener("abort", () => {
        proc.kill("SIGTERM");
      });
    }

    yield* this.processOutput(proc);
  }

  private async *processOutput(proc: ChildProcessType): AsyncGenerator<StreamChunk> {
    const stderrPromise = this.collectStderr(proc);
    const closePromise = this.waitForClose(proc);

    let hadText = false;
    if (proc.stdout) {
      proc.stdout.setEncoding("utf8");
      for await (const chunk of proc.stdout) {
        hadText = true;
        yield { type: "text", content: chunk };
      }
    }

    const exitCode = await closePromise;
    const stderrRaw = await stderrPromise;
    const stderr = this.filterGeminiStderr(stderrRaw);
    if (stderr) {
      console.error("[Ronginus][Gemini stderr]", stderr);
    }
    if (exitCode !== 0) {
      if (!hadText) {
        yield { type: "error", error: `Gemini CLI exited with code ${exitCode}` };
        return;
      }
    }

    yield { type: "done" };
  }

  private filterGeminiStderr(stderr: string): string {
    if (!stderr) return "";
    const filtered = stderr
      .split("\n")
      .filter((line) => line.trim() && !/loaded cached credentials/i.test(line))
      .join("\n")
      .trim();
    return filtered;
  }
}

/**
 * Claude CLI provider
 */
export class ClaudeCliProvider extends BaseCliProvider {
  name: CliType = "claude-cli";
  displayName = "Claude";
  private customPath?: string;

  constructor(customPath?: string) {
    super();
    this.customPath = customPath;
  }

  protected resolveVersionCommand(): { command: string; args: string[] } {
    return resolveClaudeCommand(["--version"], this.customPath);
  }

  async *chatStream(
    messages: Message[],
    systemPrompt: string,
    workingDirectory: string,
    signal?: AbortSignal
  ): AsyncGenerator<StreamChunk> {
    const { spawn } = getChildProcess();
    const prompt = formatHistoryAsPrompt(messages, systemPrompt);
    const cliArgs = ["-p", prompt, "--output-format", "stream-json", "--verbose"];
    const { command, args } = resolveClaudeCommand(cliArgs, this.customPath);

    const proc = spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
      cwd: workingDirectory || undefined,
      env: typeof process !== "undefined" ? process.env : undefined,
    });

    proc.stdin?.end();

    if (signal) {
      signal.addEventListener("abort", () => {
        proc.kill("SIGTERM");
      });
    }

    yield* this.processOutput(proc);
  }

  private async *processOutput(proc: ChildProcessType): AsyncGenerator<StreamChunk> {
    const stderrPromise = this.collectStderr(proc);
    const closePromise = this.waitForClose(proc);

    if (proc.stdout) {
      proc.stdout.setEncoding("utf8");
      let buffer = "";

      for await (const chunk of proc.stdout) {
        buffer += chunk;
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          yield* this.processJsonLine(line);
        }
      }

      if (buffer.trim()) {
        yield* this.processJsonLine(buffer);
      }
    }

    const exitCode = await closePromise;
    const stderr = await stderrPromise;
    if (stderr) {
      console.error("[Ronginus][Claude stderr]", stderr);
    }
    if (exitCode !== 0) {
      yield { type: "error", error: `Claude CLI exited with code ${exitCode}` };
      return;
    }

    yield { type: "done" };
  }

  private *processJsonLine(line: string): Generator<StreamChunk> {
    try {
      const parsed = JSON.parse(line) as Record<string, unknown>;

      if (parsed.type === "assistant") {
        const message = parsed.message as Record<string, unknown> | undefined;
        if (message && Array.isArray(message.content)) {
          for (const block of message.content as Array<Record<string, unknown>>) {
            if (block.type === "text" && typeof block.text === "string") {
              yield { type: "text", content: block.text };
            }
          }
        }
      } else if (parsed.type === "content_block_delta") {
        const delta = parsed.delta as Record<string, unknown> | undefined;
        if (delta && delta.type === "text_delta" && typeof delta.text === "string") {
          yield { type: "text", content: delta.text };
        }
      } else if (parsed.type === "error") {
        const error = parsed.error as Record<string, unknown> | undefined;
        const errorMessage = typeof error?.message === "string"
          ? error.message
          : (typeof parsed.message === "string" ? parsed.message : "Unknown error");
        yield { type: "error", error: errorMessage };
      }
    } catch {
      // Ignore JSON parse errors
    }
  }
}

/**
 * Codex CLI provider
 */
export class CodexCliProvider extends BaseCliProvider {
  name: CliType = "codex-cli";
  displayName = "Codex";
  private customPath?: string;

  constructor(customPath?: string) {
    super();
    this.customPath = customPath;
  }

  protected resolveVersionCommand(): { command: string; args: string[] } {
    return resolveCodexCommand(["--version"], this.customPath);
  }

  async *chatStream(
    messages: Message[],
    systemPrompt: string,
    workingDirectory: string,
    signal?: AbortSignal
  ): AsyncGenerator<StreamChunk> {
    const { spawn } = getChildProcess();
    const prompt = formatHistoryAsPrompt(messages, systemPrompt);
    const cliArgs = ["exec", "--json", "--skip-git-repo-check", prompt];
    const { command, args } = resolveCodexCommand(cliArgs, this.customPath);

    const proc = spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
      cwd: workingDirectory || undefined,
      env: typeof process !== "undefined" ? process.env : undefined,
    });

    proc.stdin?.end();

    if (signal) {
      signal.addEventListener("abort", () => {
        proc.kill("SIGTERM");
      });
    }

    yield* this.processOutput(proc);
  }

  private async *processOutput(proc: ChildProcessType): AsyncGenerator<StreamChunk> {
    const stderrPromise = this.collectStderr(proc);
    const closePromise = this.waitForClose(proc);

    if (proc.stdout) {
      proc.stdout.setEncoding("utf8");
      let buffer = "";

      for await (const chunk of proc.stdout) {
        buffer += chunk;
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          yield* this.processJsonLine(line);
        }
      }

      if (buffer.trim()) {
        yield* this.processJsonLine(buffer);
      }
    }

    const exitCode = await closePromise;
    const stderr = await stderrPromise;
    if (stderr) {
      console.error("[Ronginus][Codex stderr]", stderr);
    }
    if (exitCode !== 0) {
      yield { type: "error", error: `Codex CLI exited with code ${exitCode}` };
      return;
    }

    yield { type: "done" };
  }

  private *processJsonLine(line: string): Generator<StreamChunk> {
    try {
      const parsed = JSON.parse(line) as Record<string, unknown>;

      if (parsed.type === "item.completed") {
        const item = parsed.item as Record<string, unknown> | undefined;
        if (item && item.type === "agent_message" && typeof item.text === "string") {
          yield { type: "text", content: item.text };
        }
      } else if (parsed.type === "error") {
        const errorMessage = typeof parsed.message === "string"
          ? parsed.message
          : (typeof parsed.error === "string" ? parsed.error : "Unknown error");
        yield { type: "error", error: errorMessage };
      }
    } catch {
      // Ignore JSON parse errors
    }
  }
}

/**
 * CLI Provider Manager
 */
export class CliProviderManager {
  private providers: Map<CliType, CliProviderInterface> = new Map();

  constructor(cliPaths?: { gemini?: string; claude?: string; codex?: string }) {
    this.providers.set("gemini-cli", new GeminiCliProvider(cliPaths?.gemini));
    this.providers.set("claude-cli", new ClaudeCliProvider(cliPaths?.claude));
    this.providers.set("codex-cli", new CodexCliProvider(cliPaths?.codex));
  }

  getProvider(name: CliType): CliProviderInterface | undefined {
    return this.providers.get(name);
  }

  getAllProviders(): CliProviderInterface[] {
    return Array.from(this.providers.values());
  }

  async getAvailableProviders(): Promise<CliType[]> {
    const available: CliType[] = [];
    for (const [name, provider] of this.providers) {
      if (await provider.isAvailable()) {
        available.push(name);
      }
    }
    return available;
  }

  async isProviderAvailable(name: CliType): Promise<boolean> {
    const provider = this.providers.get(name);
    if (!provider) return false;
    return provider.isAvailable();
  }
}

/**
 * CLI verification result
 */
export interface CliVerifyResult {
  success: boolean;
  stage?: "version" | "auth";
  error?: string;
  version?: string;
}

/**
 * Validate CLI path
 */
export function validateCliPath(path: string): { valid: boolean; reason?: string } {
  if (!path) return { valid: false, reason: "empty" };

  // Check for invalid characters
  if (/[<>"|?*]/.test(path)) {
    return { valid: false, reason: "invalid_chars" };
  }

  // Check if file exists
  if (!fileExistsSync(path)) {
    return { valid: false, reason: "file_not_found" };
  }

  return { valid: true };
}

/**
 * Verify Gemini CLI installation and authentication
 */
export async function verifyGeminiCli(customPath?: string): Promise<CliVerifyResult> {
  if (Platform.isMobile) {
    return { success: false, stage: "version", error: "CLI not available on mobile" };
  }

  const { spawn } = getChildProcess();

  // Step 1: Check if CLI exists (--version)
  const versionCheck = await new Promise<{ success: boolean; error?: string }>((resolve) => {
    try {
      const { command, args } = resolveGeminiCommand(["--version"], customPath);
      const proc = spawn(command, args, {
        stdio: ["pipe", "pipe", "pipe"],
        shell: false,
        env: typeof process !== "undefined" ? process.env : undefined,
      });

      // Close stdin immediately
      proc.stdin?.end();

      let stderr = "";
      proc.stderr?.on("data", (data: Uint8Array) => {
        stderr += new TextDecoder().decode(data);
      });

      // Drain stdout to prevent buffer blocking
      proc.stdout?.on("data", () => {});

      proc.on("close", (code: number | null) => {
        if (code === 0) {
          resolve({ success: true });
        } else {
          resolve({ success: false, error: stderr || `Exit code: ${code}` });
        }
      });

      proc.on("error", (err: Error) => {
        resolve({ success: false, error: err.message });
      });

      setTimeout(() => {
        proc.kill();
        resolve({ success: false, error: "Timeout" });
      }, 30000);
    } catch (err) {
      resolve({ success: false, error: String(err) });
    }
  });

  if (!versionCheck.success) {
    return { success: false, stage: "version", error: versionCheck.error || "Gemini CLI not found" };
  }

  // Step 2: Check if logged in (run a simple prompt)
  const loginCheck = await new Promise<{ success: boolean; error?: string }>((resolve) => {
    try {
      const { command, args } = resolveGeminiCommand(["-p", "Hello"], customPath);
      const proc = spawn(command, args, {
        stdio: ["pipe", "pipe", "pipe"],
        shell: false,
        env: typeof process !== "undefined" ? process.env : undefined,
      });

      // Close stdin immediately
      proc.stdin?.end();

      let stderr = "";
      proc.stderr?.on("data", (data: Uint8Array) => {
        stderr += new TextDecoder().decode(data);
      });

      // Drain stdout to prevent buffer blocking
      proc.stdout?.on("data", () => {});

      proc.on("close", (code: number | null) => {
        if (code === 0) {
          resolve({ success: true });
        } else {
          resolve({ success: false, error: stderr || `Exit code: ${code}` });
        }
      });

      proc.on("error", (err: Error) => {
        resolve({ success: false, error: err.message });
      });

      setTimeout(() => {
        proc.kill();
        resolve({ success: false, error: "Timeout - CLI may not be logged in" });
      }, 60000);
    } catch (err) {
      resolve({ success: false, error: String(err) });
    }
  });

  if (!loginCheck.success) {
    return { success: false, stage: "auth", error: loginCheck.error || "Please run 'gemini auth login' to log in" };
  }

  return { success: true };
}

/**
 * Format Windows Claude CLI error message
 */
function formatWindowsClaudeCliError(message: string | undefined): string | undefined {
  if (!isWindows()) return message;
  if (!message) {
    return "Claude CLI not found. Install it with `npm install -g @anthropic-ai/claude-code` and ensure it is in your PATH.";
  }
  if (
    message.includes("Cannot find module") ||
    message.includes("MODULE_NOT_FOUND") ||
    message.includes("@anthropic-ai\\claude-code") ||
    message.includes("ENOENT")
  ) {
    return "Claude CLI not found. Install it with `npm install -g @anthropic-ai/claude-code` and ensure it is in your PATH.";
  }
  return message;
}

/**
 * Verify Claude CLI installation and authentication
 */
export async function verifyClaudeCli(customPath?: string): Promise<CliVerifyResult> {
  if (Platform.isMobile) {
    return { success: false, stage: "version", error: "CLI not available on mobile" };
  }

  const { spawn } = getChildProcess();

  // Step 1: Check if CLI exists (--version)
  const versionCheck = await new Promise<{ success: boolean; error?: string }>((resolve) => {
    try {
      const { command, args } = resolveClaudeCommand(["--version"], customPath);
      const proc = spawn(command, args, {
        stdio: ["pipe", "pipe", "pipe"],
        shell: false,
        env: typeof process !== "undefined" ? process.env : undefined,
      });

      // Close stdin immediately to signal no more input
      proc.stdin?.end();

      let stderr = "";
      proc.stderr?.on("data", (data: Uint8Array) => {
        stderr += new TextDecoder().decode(data);
      });

      // Drain stdout to prevent buffer blocking
      proc.stdout?.on("data", () => {
        // Ignore stdout data, just drain the buffer
      });

      proc.on("close", (code: number | null) => {
        if (code === 0) {
          resolve({ success: true });
        } else {
          resolve({ success: false, error: formatWindowsClaudeCliError(stderr) || `Exit code: ${code}` });
        }
      });

      proc.on("error", (err: Error) => {
        resolve({ success: false, error: formatWindowsClaudeCliError(err.message) });
      });

      setTimeout(() => {
        proc.kill();
        resolve({ success: false, error: formatWindowsClaudeCliError("Timeout") });
      }, 30000);
    } catch (err) {
      resolve({ success: false, error: formatWindowsClaudeCliError(String(err)) });
    }
  });

  if (!versionCheck.success) {
    return { success: false, stage: "version", error: versionCheck.error || "Claude CLI not found" };
  }

  // Step 2: Check if logged in (run a simple prompt)
  const loginCheck = await new Promise<{ success: boolean; error?: string }>((resolve) => {
    try {
      const { command, args } = resolveClaudeCommand(["-p", "Hello", "--output-format", "text"], customPath);
      const proc = spawn(command, args, {
        stdio: ["pipe", "pipe", "pipe"],
        shell: false,
        env: typeof process !== "undefined" ? process.env : undefined,
      });

      // Close stdin immediately to signal no more input
      proc.stdin?.end();

      let stderr = "";
      proc.stderr?.on("data", (data: Uint8Array) => {
        stderr += new TextDecoder().decode(data);
      });

      // Drain stdout to prevent buffer blocking
      proc.stdout?.on("data", () => {
        // Ignore stdout data, just drain the buffer
      });

      proc.on("close", (code: number | null) => {
        if (code === 0) {
          resolve({ success: true });
        } else {
          resolve({ success: false, error: formatWindowsClaudeCliError(stderr) || `Exit code: ${code}` });
        }
      });

      proc.on("error", (err: Error) => {
        resolve({ success: false, error: formatWindowsClaudeCliError(err.message) });
      });

      setTimeout(() => {
        proc.kill();
        resolve({ success: false, error: formatWindowsClaudeCliError("Timeout - CLI may not be logged in") });
      }, 60000);
    } catch (err) {
      resolve({ success: false, error: formatWindowsClaudeCliError(String(err)) });
    }
  });

  if (!loginCheck.success) {
    return { success: false, stage: "auth", error: loginCheck.error || "Please run 'claude' in terminal to log in" };
  }

  return { success: true };
}

/**
 * Verify Codex CLI installation and authentication
 */
export async function verifyCodexCli(customPath?: string): Promise<CliVerifyResult> {
  if (Platform.isMobile) {
    return { success: false, stage: "version", error: "CLI not available on mobile" };
  }

  const { spawn } = getChildProcess();

  // Step 1: Check if CLI exists (--version)
  const versionCheck = await new Promise<{ success: boolean; error?: string }>((resolve) => {
    try {
      const { command, args } = resolveCodexCommand(["--version"], customPath);
      const proc = spawn(command, args, {
        stdio: ["pipe", "pipe", "pipe"],
        shell: false,
        env: typeof process !== "undefined" ? process.env : undefined,
      });

      // Close stdin immediately
      proc.stdin?.end();

      let stderr = "";
      proc.stderr?.on("data", (data: Uint8Array) => {
        stderr += new TextDecoder().decode(data);
      });

      // Drain stdout to prevent buffer blocking
      proc.stdout?.on("data", () => {});

      proc.on("close", (code: number | null) => {
        if (code === 0) {
          resolve({ success: true });
        } else {
          resolve({ success: false, error: stderr || `Exit code: ${code}` });
        }
      });

      proc.on("error", (err: Error) => {
        resolve({ success: false, error: err.message });
      });

      setTimeout(() => {
        proc.kill();
        resolve({ success: false, error: "Timeout" });
      }, 30000);
    } catch (err) {
      resolve({ success: false, error: String(err) });
    }
  });

  if (!versionCheck.success) {
    return { success: false, stage: "version", error: versionCheck.error || "Codex CLI not found" };
  }

  // For Codex, version check is sufficient - auth is handled via OPENAI_API_KEY
  return { success: true };
}
