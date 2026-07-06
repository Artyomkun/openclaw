#!/usr/bin/env node
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
} from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { deflateSync } from "node:zlib";
import { parseArgs } from "node:util";

const EXCLUDED_DIRS = new Set([".git", ".svn", ".hg", "__pycache__", "node_modules"]);

async function validateSkill(skillPath: string): Promise<{ valid: boolean; message: string }> {
    const skillDir = resolve(skillPath);
    const skillMd = join(skillDir, "SKILL.md");

    try {
        await readFile(skillMd, "utf-8");
    } catch {
        return { valid: false, message: `SKILL.md not found in ${skillPath}` };
    }

    const content = await readFile(skillMd, "utf-8");

    if (!content.startsWith("---")) {
        return { valid: false, message: "SKILL.md must start with YAML frontmatter (---)" };
    }

    const endIndex = content.indexOf("---", 3);
    if (endIndex === -1) {
        return { valid: false, message: "SKILL.md has incomplete YAML frontmatter" };
    }

    const frontmatter = content.slice(3, endIndex);
    if (!frontmatter.includes("name:")) {
        return { valid: false, message: "SKILL.md frontmatter must contain 'name:'" };
    }
    if (!frontmatter.includes("description:")) {
        return { valid: false, message: "SKILL.md frontmatter must contain 'description:'" };
    }

    return { valid: true, message: "Skill is valid" };
}

async function packageSkill(skillPath: string, outputDir?: string): Promise<string | null> {
    const skillDir = resolve(skillPath);

    if (!existsSync(skillDir)) {
        console.error(`[ERROR] Skill folder not found: ${skillDir}`);
        return null;
    }

    const skillMd = join(skillDir, "SKILL.md");
    if (!existsSync(skillMd)) {
        console.error(`[ERROR] SKILL.md not found in ${skillDir}`);
        return null;
    }

    console.log("Validating skill...");
    const { valid, message } = await validateSkill(skillPath);
    if (!valid) {
        console.error(`[ERROR] Validation failed: ${message}`);
        console.error("   Please fix the validation errors before packaging.");
        return null;
    }
    console.log(`[OK] ${message}\n`);

    const skillName = skillDir.split("/").pop() || "skill";
    const outputPath = outputDir ? resolve(outputDir) : process.cwd();
    mkdirSync(outputPath, { recursive: true });

    const skillFilename = join(outputPath, `${skillName}.skill`);

    try {
        const writeStream = createWriteStream(skillFilename);
        const zip = new ZipWriter(writeStream);

        const files: Array<{ path: string; relPath: string }> = [];

        const walk = (dir: string, relRoot: string) => {
            const items = readdirSync(dir, { withFileTypes: true });
            for (const item of items) {
                const fullPath = join(dir, item.name);
                const relPath = relRoot ? join(relRoot, item.name) : item.name;

                if (item.isDirectory()) {
                if (EXCLUDED_DIRS.has(item.name)) continue;
                walk(fullPath, relPath);
                continue;
                }

                if (item.isFile()) {
                files.push({ path: fullPath, relPath });
                }
            }
        };

        walk(skillDir, "");

        // Сортируем для детерминированного вывода
        files.sort((a, b) => a.relPath.localeCompare(b.relPath));

        for (const file of files) {
        const data = await readFile(file.path);
        const lastModified = statSync(file.path).mtime;
        zip.addFile(file.relPath, data, lastModified);
        console.log(`  Added: ${file.relPath}`);
        }

        await zip.finish();

        console.log(`\n[OK] Successfully packaged skill to: ${skillFilename}`);
        return skillFilename;
    } catch (err) {
        console.error(`[ERROR] Error creating .skill file: ${err}`);
        return null;
    }
}

// ============================================================
// ZIP WRITER — правильная реализация
// ============================================================

const ZIP_LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const ZIP_CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;

class ZipWriter {
    private entries: Array<{ fileName: string; localOffset: number }> = [];
    private centralDirectory: Buffer[] = [];
    private offset = 0;

    constructor(private stream: NodeJS.WritableStream) {}

    addFile(fileName: string, data: Buffer, lastModified: Date): void {
        const dosTime = this.toDosTime(lastModified);
        const crc32 = this.crc32(data);
        const uncompressedSize = data.length;
        const compressedData = this.deflate(data);
        const compressedSize = compressedData.length;

        // Local file header
        const localHeader = Buffer.alloc(30);
        localHeader.writeUInt32LE(ZIP_LOCAL_FILE_HEADER_SIGNATURE, 0);
        localHeader.writeUInt16LE(0x0014, 4);
        localHeader.writeUInt16LE(0x0000, 6);
        localHeader.writeUInt16LE(0x0008, 8);
        localHeader.writeUInt32LE(dosTime, 10);
        localHeader.writeUInt32LE(crc32, 14);
        localHeader.writeUInt32LE(compressedSize, 18);
        localHeader.writeUInt32LE(uncompressedSize, 22);
        localHeader.writeUInt16LE(fileName.length, 26);
        localHeader.writeUInt16LE(0, 28);

        const fileNameBuffer = Buffer.from(fileName, "utf-8");

        // Central directory header
        const centralHeader = Buffer.alloc(46 + fileName.length);
        centralHeader.writeUInt32LE(ZIP_CENTRAL_DIRECTORY_SIGNATURE, 0);
        centralHeader.writeUInt16LE(0x0014, 4);
        centralHeader.writeUInt16LE(0x0014, 6);
        centralHeader.writeUInt16LE(0x0000, 8);
        centralHeader.writeUInt16LE(0x0008, 10);
        centralHeader.writeUInt32LE(dosTime, 12);
        centralHeader.writeUInt32LE(crc32, 16);
        centralHeader.writeUInt32LE(compressedSize, 20);
        centralHeader.writeUInt32LE(uncompressedSize, 24);
        centralHeader.writeUInt16LE(fileName.length, 28);
        centralHeader.writeUInt16LE(0, 30);
        centralHeader.writeUInt16LE(0, 32);
        centralHeader.writeUInt16LE(0, 34);
        centralHeader.writeUInt16LE(0, 36);
        centralHeader.writeUInt32LE(0, 38);
        centralHeader.writeUInt32LE(this.offset, 42);
        fileNameBuffer.copy(centralHeader, 46);

        // Записываем в поток
        this.stream.write(localHeader);
        this.stream.write(fileNameBuffer);
        this.stream.write(compressedData);

        this.entries.push({ fileName, localOffset: this.offset });
        this.centralDirectory.push(centralHeader);

        this.offset +=
        30 + fileNameBuffer.length + compressedData.length;
    }

    async finish(): Promise<void> {
        const centralOffset = this.offset;
        for (const header of this.centralDirectory) {
            this.stream.write(header);
            this.offset += header.length;
        }

        const totalEntries = this.entries.length;
        const centralSize = this.centralDirectory.reduce((sum, h) => sum + h.length, 0);

        const endOfCentral = Buffer.alloc(22);
        endOfCentral.writeUInt32LE(ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE, 0);
        endOfCentral.writeUInt16LE(0, 4);
        endOfCentral.writeUInt16LE(0, 6);
        endOfCentral.writeUInt16LE(totalEntries, 8);
        endOfCentral.writeUInt16LE(totalEntries, 10);
        endOfCentral.writeUInt32LE(centralSize, 12);
        endOfCentral.writeUInt32LE(centralOffset, 16);
        endOfCentral.writeUInt16LE(0, 20);

        this.stream.write(endOfCentral);

        return new Promise((resolve, reject) => {
        this.stream.end((err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    private toDosTime(date: Date): number {
        const year = date.getFullYear() - 1980;
        const month = date.getMonth() + 1;
        const day = date.getDate();
        const hours = date.getHours();
        const minutes = date.getMinutes();
        const seconds = date.getSeconds();
        return (
        (year << 25) |
        (month << 21) |
        (day << 16) |
        (hours << 11) |
        (minutes << 5) |
        (seconds >> 1)
        );
    }

    private crc32(data: Buffer): number {
        let crc = 0xffffffff;
        for (const byte of data) {
        crc ^= byte;
        for (let i = 0; i < 8; i++) {
            if (crc & 1) {
            crc = (crc >>> 1) ^ 0xedb88320;
            } else {
            crc >>>= 1;
            }
        }
        }
        return crc ^ 0xffffffff;
    }

    private deflate(data: Buffer): Buffer {
        try {
            return deflateSync(data, { level: 6 });
        } catch (err) {
            console.warn(`[WARN] Deflate failed, using uncompressed data: ${err}`);
            return data;
        }
    }
}

// ============================================================
// MAIN
// ============================================================

async function main(): Promise<number> {
    const args = parseArgs({
        allowPositionals: true,
        options: {
        output: { type: "string" },
        },
    });

    const positionals = args.positionals || [];
    if (positionals.length === 0) {
        console.error("Usage: tsx scripts/package_skill.ts <path/to/skill-folder> [output-directory]");
        console.error("\nExample:");
        console.error("  tsx scripts/package_skill.ts skills/public/my-skill");
        console.error("  tsx scripts/package_skill.ts skills/public/my-skill ./dist");
        return 1;
    }

    const skillPath = positionals[0];
    const outputDir = positionals[1] || args.values.output;

    console.log(`Packaging skill: ${skillPath}`);
    if (outputDir) {
        console.log(`   Output directory: ${outputDir}`);
    }
    console.log();

    const result = await packageSkill(skillPath, outputDir);
    return result ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    process.exit(await main());
}