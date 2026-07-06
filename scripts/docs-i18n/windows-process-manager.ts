#!/usr/bin/env node
import { exec } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';

const execAsync = promisify(exec);
const DEFAULT_WINDOWS_SYSTEM_ROOT = 'C:\\Windows';

export function resolveWindowsTaskkillPath(): string {
	let systemRoot = normalizeWindowsSystemRoot(process.env.SystemRoot || '');
	if (!systemRoot) {
		systemRoot = normalizeWindowsSystemRoot(process.env.WINDIR || '');
	}
	if (!systemRoot) {
		systemRoot = DEFAULT_WINDOWS_SYSTEM_ROOT;
	}
	return join(systemRoot, 'System32', 'taskkill.exe');
}

export function normalizeWindowsSystemRoot(raw: string | undefined): string {
	if (!raw) return '';
	
	const trimmed = raw.trim();
	if (
		!trimmed ||
		trimmed.includes('\x00') ||
		trimmed.includes('\r') ||
		trimmed.includes('\n') ||
		trimmed.includes(';') ||
		trimmed.startsWith('\\\\') ||
		!isAbsolutePath(trimmed)
	) {
		return '';
	}

	const cleaned = trimTrailingSlash(trimmed);
	const volume = getVolumeName(cleaned);
	if (!volume || cleaned.length <= volume.length + 1) {
		return '';
	}

	return cleaned;
}

function isAbsolutePath(path: string): boolean {
	return /^[A-Za-z]:[/\\]/.test(path) || path.startsWith('\\\\');
}

function getVolumeName(path: string): string {
	const match = path.match(/^[A-Za-z]:/);
	return match ? match[0] : '';
}

function trimTrailingSlash(path: string): string {
	return path.replace(/[\\/]+$/, '');
}

export async function gracefulKillProcess(
	pid: number,
	timeoutMs: number = 5000
): Promise<void> {
	try {
		try {
			process.kill(pid, 'SIGTERM');
		} catch {
			return;
		}
		await sleep(timeoutMs);
		try {
			process.kill(pid, 'SIGKILL');
		} catch {
			return;
		}
		await sleep(1000);
		const isAlive = await isProcessAlive(pid);
		if (isAlive) {
			console.warn(`[ProcessManager] Process ${pid} still alive, using taskkill`);
			await runWindowsTaskkill(pid);
		}
	} catch (err) {
		const error = err as Error;
		if (!error.message?.includes('ESRCH')) {
			console.warn(`[ProcessManager] Failed to kill process ${pid}:`, err);
		}
	}
}

async function isProcessAlive(pid: number): Promise<boolean> {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

export async function runWindowsTaskkill(pid: number): Promise<void> {
	const taskkillPath = resolveWindowsTaskkillPath();
	const args = ['/T', '/F', '/PID', String(pid)];

	try {
		await execAsync(`"${taskkillPath}" ${args.join(' ')}`);
	} catch (err) {
		const error = err as Error;
		if (!error.message?.includes('not found') && !error.message?.includes('no such process')) {
			throw err;
		}
	}
}

export function configureCommandGracefulShutdown(
	childProcess: any,
	pid: number,
	timeoutMs: number = 5000
): void {
	const originalKill = childProcess.kill.bind(childProcess);

	childProcess.kill = function (signal?: string): boolean {
		if (signal) {
			return originalKill(signal);
		}

		gracefulKillProcess(pid, timeoutMs).catch(() => {});
		return true;
	};

	childProcess._pid = pid;
	childProcess._gracefulKill = gracefulKillProcess;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}