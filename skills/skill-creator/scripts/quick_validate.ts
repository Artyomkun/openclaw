#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";

const MAX_SKILL_NAME_LENGTH = 64;
const MAX_DESCRIPTION_LENGTH = 1024;
const ALLOWED_PROPERTIES = new Set([
    "name",
    "description",
    "homepage",
    "license",
    "allowed-tools",
    "user-invocable",
    "metadata",
]);

type ValidationResult = { valid: true; message: string } | { valid: false; message: string };

function normalizeSkillName(name: string): string {
    return name.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-");
}

function extractFrontmatter(content: string): string | null {
    const lines = content.split("\n");
    if (lines.length === 0 || lines[0].trim() !== "---") {
        return null;
    }
    for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim() === "---") {
            return lines.slice(1, i).join("\n");
        }
    }
    return null;
}

function parseFrontmatter(text: string): Record<string, string> {
    const result: Record<string, string> = {};
    let currentKey: string | null = null;

    for (const rawLine of text.split("\n")) {
        const stripped = rawLine.trim();
        if (!stripped || stripped.startsWith("#")) continue;

        const isIndented = rawLine[0] === " " || rawLine[0] === "\t";
        if (isIndented) {
            if (!currentKey) continue;
            const currentValue = result[currentKey] || "";
            result[currentKey] = currentValue ? `${currentValue}\n${stripped}` : stripped;
            continue;
        }

        const colonIndex = stripped.indexOf(":");
        if (colonIndex === -1) continue;

        const key = stripped.slice(0, colonIndex).trim();
        let value = stripped.slice(colonIndex + 1).trim();

        if (!key) continue;

        if ((value.startsWith('"') && value.endsWith('"')) || 
                (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }

        result[key] = value;
        currentKey = key;
    }

    return result;
}

async function validateSkill(skillPath: string): Promise<ValidationResult> {
    const skillDir = resolve(skillPath);
    const skillMdPath = resolve(skillDir, "SKILL.md");

    try {
        await readFile(skillMdPath, "utf-8");
    } catch {
        return { valid: false, message: "SKILL.md not found" };
    }

    let content: string;
    try {
        content = await readFile(skillMdPath, "utf-8");
    } catch (err) {
        return { valid: false, message: `Could not read SKILL.md: ${err}` };
    }

    const frontmatterText = extractFrontmatter(content);
    if (!frontmatterText) {
        return { valid: false, message: "Invalid frontmatter format" };
    }

    let frontmatter: Record<string, string>;
    try {
        const yamlLike = frontmatterText.replace(/^/gm, '  ');
        frontmatter = parseFrontmatter(frontmatterText);
    } catch {
        return { valid: false, message: "Invalid YAML in frontmatter" };
    }

    const unexpectedKeys = Object.keys(frontmatter).filter((k) => !ALLOWED_PROPERTIES.has(k));
    if (unexpectedKeys.length > 0) {
        const allowed = Array.from(ALLOWED_PROPERTIES).sort().join(", ");
        const unexpected = unexpectedKeys.sort().join(", ");
        return {
        valid: false,
        message: `Unexpected key(s) in SKILL.md frontmatter: ${unexpected}. Allowed properties are: ${allowed}`,
        };
    }

    if (!frontmatter.name) {
        return { valid: false, message: "Missing 'name' in frontmatter" };
    }
    if (!frontmatter.description) {
        return { valid: false, message: "Missing 'description' in frontmatter" };
    }

    const name = frontmatter.name.trim();
    if (!name) {
        return { valid: false, message: "Name must not be empty" };
    }
    if (!/^[a-z0-9-]+$/.test(name)) {
        return {
        valid: false,
        message: `Name '${name}' should be hyphen-case (lowercase letters, digits, and hyphens only)`,
        };
    }
    if (name.startsWith("-") || name.endsWith("-") || name.includes("--")) {
        return {
        valid: false,
        message: `Name '${name}' cannot start/end with hyphen or contain consecutive hyphens`,
        };
    }
    if (name.length > MAX_SKILL_NAME_LENGTH) {
        return {
        valid: false,
        message: `Name is too long (${name.length} characters). Maximum is ${MAX_SKILL_NAME_LENGTH} characters.`,
        };
    }

    const description = frontmatter.description.trim();
    if (!description) {
        return { valid: false, message: "Description must not be empty" };
    }
    if (description.includes("<") || description.includes(">")) {
        return { valid: false, message: "Description cannot contain angle brackets (< or >)" };
    }
    if (description.length > MAX_DESCRIPTION_LENGTH) {
        return {
        valid: false,
        message: `Description is too long (${description.length} characters). Maximum is ${MAX_DESCRIPTION_LENGTH} characters.`,
        };
    }

    return { valid: true, message: "Skill is valid!" };
}

async function main(): Promise<number> {
    const args = parseArgs({
        allowPositionals: true,
    });

    const positionals = args.positionals || [];
    if (positionals.length === 0) {
        console.error("Usage: tsx scripts/quick-validate.ts <skill_directory>");
        return 1;
    }

    const skillPath = positionals[0];
    const result = await validateSkill(skillPath);

    console.log(result.message);
    return result.valid ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(await main());
}