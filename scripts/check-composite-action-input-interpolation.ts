#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const INPUT_INTERPOLATION_RE = /\$\{\{\s*inputs\./g;
const RUN_LINE_RE = /^(\s*)run:\s*(.*)$/;
const USING_COMPOSITE_RE = /^\s*using:\s*composite\s*$/m;

function indentation(line: string): number {
    return line.length - line.trimStart().length;
}

function scanFile(filePath: string): Array<{ line: number; content: string }> {
    const text = fs.readFileSync(filePath, "utf-8");
    if (!USING_COMPOSITE_RE.test(text)) return [];

    const lines = text.split("\n");
    const violations: Array<{ line: number; content: string }> = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const match = RUN_LINE_RE.exec(line);
        if (!match) continue;

        const runIndent = match[1].length;
        const runValue = match[2].trim();
        const lineNo = i + 1;
        if (runValue && !runValue.startsWith("|") && !runValue.startsWith(">")) {
            if (INPUT_INTERPOLATION_RE.test(runValue)) {
                violations.push({ line: lineNo, content: line.trim() });
            }
            continue;
        }
        let j = i + 1;
        while (j < lines.length) {
            const scriptLine = lines[j];
            if (scriptLine.trim() === "") {
                j++;
                continue;
            }
            if (indentation(scriptLine) <= runIndent) break;
            if (INPUT_INTERPOLATION_RE.test(scriptLine)) {
                violations.push({ line: j + 1, content: scriptLine.trim() });
            }
            j++;
        }
    }

    return violations;
}

function main(): number {
    const actionsDir = path.join(".github", "actions");
    if (!fs.existsSync(actionsDir)) {
        console.log("No .github/actions directory found");
        return 0;
    }

    const files = fs.readdirSync(actionsDir, { recursive: true })
        .filter((f) => typeof f === "string" && /action\.y?ml$/.test(f))
        .map((f) => path.join(actionsDir, f as string));

    let hasViolations = false;

    for (const file of files) {
        const violations = scanFile(file);
        if (violations.length === 0) continue;

        hasViolations = true;
        for (const v of violations) {
        console.log(`❌ ${file}:${v.line}: ${v.content}`);
        }
    }

    if (hasViolations) {
        console.log("\n⚠️  Disallowed direct inputs interpolation in composite run blocks.");
        console.log("   Use 'env:' and reference shell variables instead.\n");
        console.log("   ❌ Bad:");
        console.log('   run: echo "${{ inputs.foo }}"');
        console.log("   ✅ Good:");
        console.log("   env:");
        console.log("     FOO: ${{ inputs.foo }}");
        console.log('   run: echo "$FOO"');
        return 1;
    }

    console.log("✅ No direct inputs interpolation found in composite run blocks.");
    return 0;
}

process.exit(main());