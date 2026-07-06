#!/usr/bin/env node
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function killProcessGroupUnix(pid: number): Promise<void> {
    try {
        await execAsync(`kill -9 -${pid}`);
    } catch (err: any) {
        if (err?.message?.includes('ESRCH') || err?.message?.includes('No such process')) {
            return;
        }
        throw err;
    }
}

export function isProcessAliveUnix(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

export function configureUnixCommand(childProcess: any, pid: number): void {
    const originalKill = childProcess.kill.bind(childProcess);

    childProcess.kill = function (signal?: string): boolean {
        if (signal) {
        return originalKill(signal);
        }
        killProcessGroupUnix(pid).catch(() => {});
        return true;
    };

    childProcess._pid = pid;
    childProcess._killGroup = killProcessGroupUnix;
}

export function createDetachedCommand(command: string, args: string[]): any {
    const { spawn } = require('child_process');
    const child = spawn(command, args, {
        detached: true,
        stdio: 'ignore',
    });
    child._killGroup = async () => {
        if (child.pid) {
        await killProcessGroupUnix(child.pid);
        }
    };

    return child;
}