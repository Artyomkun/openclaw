#!/usr/bin/env node
import { mkdir, writeFile, chmod, access, constants } from "node:fs/promises";
import { resolve, join } from "node:path";
import { parseArgs } from "node:util";

const MAX_SKILL_NAME_LENGTH = 64;
const ALLOWED_RESOURCES = new Set(["scripts", "references", "assets"]);

const SKILL_TEMPLATE = `---
name: {skill_name}
description: '[TODO: Complete and informative explanation of what the skill does and when to use it. Include WHEN to use this skill - specific scenarios, file types, or tasks that trigger it.]'
---

# {skill_title}

## Overview

[TODO: 1-2 sentences explaining what this skill enables]

## Structuring This Skill

[TODO: Choose the structure that best fits this skill's purpose. Common patterns:

**1. Workflow-Based** (best for sequential processes)
- Works well when there are clear step-by-step procedures
- Example: DOCX skill with "Workflow Decision Tree" -> "Reading" -> "Creating" -> "Editing"
- Structure: ## Overview -> ## Workflow Decision Tree -> ## Step 1 -> ## Step 2...

**2. Task-Based** (best for tool collections)
- Works well when the skill offers different operations/capabilities
- Example: PDF skill with "Quick Start" -> "Merge PDFs" -> "Split PDFs" -> "Extract Text"
- Structure: ## Overview -> ## Quick Start -> ## Task Category 1 -> ## Task Category 2...

**3. Reference/Guidelines** (best for standards or specifications)
- Works well for brand guidelines, coding standards, or requirements
- Example: Brand styling with "Brand Guidelines" -> "Colors" -> "Typography" -> "Features"
- Structure: ## Overview -> ## Guidelines -> ## Specifications -> ## Usage...

**4. Capabilities-Based** (best for integrated systems)
- Works well when the skill provides multiple interrelated features
- Example: Product Management with "Core Capabilities" -> numbered capability list
- Structure: ## Overview -> ## Core Capabilities -> ### 1. Feature -> ### 2. Feature...

Patterns can be mixed and matched as needed. Most skills combine patterns (e.g., start with task-based, add workflow for complex operations).

Delete this entire "Structuring This Skill" section when done - it's just guidance.]

## [TODO: Replace with the first main section based on chosen structure]

[TODO: Add content here. See examples in existing skills:
- Code samples for technical skills
- Decision trees for complex workflows
- Concrete examples with realistic user requests
- References to scripts/templates/references as needed]

## Resources (optional)

Create only the resource directories this skill actually needs. Delete this section if no resources are required.

### scripts/
Executable code (Python/Bash/etc.) that can be run directly to perform specific operations.

**Examples from other skills:**
- PDF skill: \`fill_fillable_fields.py\`, \`extract_form_field_info.py\` - utilities for PDF manipulation
- DOCX skill: \`document.py\`, \`utilities.py\` - Python modules for document processing

**Appropriate for:** Python scripts, shell scripts, or any executable code that performs automation, data processing, or specific operations.

**Note:** Scripts may be executed without loading into context, but can still be read by Codex for patching or environment adjustments.

### references/
Documentation and reference material intended to be loaded into context to inform Codex's process and thinking.

**Examples from other skills:**
- Product management: \`communication.md\`, \`context_building.md\` - detailed workflow guides
- BigQuery: API reference documentation and query examples
- Finance: Schema documentation, company policies

**Appropriate for:** In-depth documentation, API references, database schemas, comprehensive guides, or any detailed information that Codex should reference while working.

### assets/
Files not intended to be loaded into context, but rather used within the output Codex produces.

**Examples from other skills:**
- Brand styling: PowerPoint template files (.pptx), logo files
- Frontend builder: HTML/React boilerplate project directories
- Typography: Font files (.ttf, .woff2)

**Appropriate for:** Templates, boilerplate code, document templates, images, icons, fonts, or any files meant to be copied or used in the final output.

---

**Not every skill requires all three types of resources.**
`;

const EXAMPLE_SCRIPT = `#!/usr/bin/env python3
"""
Example helper script for {skill_name}

This is a placeholder script that can be executed directly.
Replace with actual implementation or delete if not needed.

Example real scripts from other skills:
- pdf/scripts/fill_fillable_fields.py - Fills PDF form fields
- pdf/scripts/convert_pdf_to_images.py - Converts PDF pages to images
"""

def main():
    print("This is an example script for {skill_name}")
    # TODO: Add actual script logic here
    # This could be data processing, file conversion, API calls, etc.

if __name__ == "__main__":
    main()
`;

const EXAMPLE_REFERENCE = `# Reference Documentation for {skill_title}

This is a placeholder for detailed reference documentation.
Replace with actual reference content or delete if not needed.

Example real reference docs from other skills:
- product-management/references/communication.md - Comprehensive guide for status updates
- product-management/references/context_building.md - Deep-dive on gathering context
- bigquery/references/ - API references and query examples

## When Reference Docs Are Useful

Reference docs are ideal for:
- Comprehensive API documentation
- Detailed workflow guides
- Complex multi-step processes
- Information too lengthy for main SKILL.md
- Content that's only needed for specific use cases

## Structure Suggestions

### API Reference Example
- Overview
- Authentication
- Endpoints with examples
- Error codes
- Rate limits

### Workflow Guide Example
- Prerequisites
- Step-by-step instructions
- Common patterns
- Troubleshooting
- Best practices
`;

const EXAMPLE_ASSET = `# Example Asset File

This placeholder represents where asset files would be stored.
Replace with actual asset files (templates, images, fonts, etc.) or delete if not needed.

Asset files are NOT intended to be loaded into context, but rather used within
the output Codex produces.

Example asset files from other skills:
- Brand guidelines: logo.png, slides_template.pptx
- Frontend builder: hello-world/ directory with HTML/React boilerplate
- Typography: custom-font.ttf, font-family.woff2
- Data: sample_data.csv, test_dataset.json

## Common Asset Types

- Templates: .pptx, .docx, boilerplate directories
- Images: .png, .jpg, .svg, .gif
- Fonts: .ttf, .otf, .woff, .woff2
- Boilerplate code: Project directories, starter files
- Icons: .ico, .svg
- Data files: .csv, .json, .xml, .yaml

Note: This is a text placeholder. Actual assets can be any file type.
`;

function normalizeSkillName(name: string): string {
    let normalized = name.trim().toLowerCase();
    normalized = normalized.replace(/[^a-z0-9]+/g, "-");
    normalized = normalized.replace(/^-+|-+$/g, "");
    normalized = normalized.replace(/-{2,}/g, "-");
    return normalized;
}

function titleCaseSkillName(name: string): string {
    return name.split("-").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

function parseResources(raw: string): string[] {
    if (!raw) return [];
    const resources = raw.split(",").map((r) => r.trim()).filter(Boolean);
    const invalid = resources.filter((r) => !ALLOWED_RESOURCES.has(r));
    if (invalid.length > 0) {
        console.error(`[ERROR] Unknown resource type(s): ${invalid.join(", ")}`);
        console.error(`   Allowed: ${Array.from(ALLOWED_RESOURCES).join(", ")}`);
        process.exit(1);
    }
    return [...new Set(resources)];
}

async function createResourceDirs(
    skillDir: string,
    skillName: string,
    skillTitle: string,
    resources: string[],
    includeExamples: boolean,
): Promise<void> {
    for (const resource of resources) {
        const resourceDir = join(skillDir, resource);
        await mkdir(resourceDir, { recursive: true });
        console.log(`[OK] Created ${resource}/`);

        if (includeExamples) {
            if (resource === "scripts") {
                const scriptPath = join(resourceDir, "example.py");
                await writeFile(scriptPath, EXAMPLE_SCRIPT.replace(/\{skill_name\}/g, skillName));
                await chmod(scriptPath, 0o755);
                console.log(`[OK] Created ${resource}/example.py`);
            } else if (resource === "references") {
                const refPath = join(resourceDir, "api_reference.md");
                await writeFile(refPath, EXAMPLE_REFERENCE.replace(/\{skill_title\}/g, skillTitle));
                console.log(`[OK] Created ${resource}/api_reference.md`);
            } else if (resource === "assets") {
                const assetPath = join(resourceDir, "example_asset.txt");
                await writeFile(assetPath, EXAMPLE_ASSET);
                console.log(`[OK] Created ${resource}/example_asset.txt`);
            }
        }
    }
}

async function initSkill(
    skillName: string,
    path: string,
    resources: string[],
    includeExamples: boolean,
): Promise<boolean> {
    const skillDir = resolve(path, skillName);

    // Check if directory exists
    try {
        await mkdir(skillDir, { recursive: false });
        console.log(`[OK] Created skill directory: ${skillDir}`);
    } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "EEXIST") {
            console.error(`[ERROR] Skill directory already exists: ${skillDir}`);
            return false;
        }
        console.error(`[ERROR] Error creating directory: ${err}`);
        return false;
    }

    // Create SKILL.md
    const skillTitle = titleCaseSkillName(skillName);
    const skillContent = SKILL_TEMPLATE
        .replace(/\{skill_name\}/g, skillName)
        .replace(/\{skill_title\}/g, skillTitle);
    
    const skillMdPath = join(skillDir, "SKILL.md");
    await writeFile(skillMdPath, skillContent);
    console.log("[OK] Created SKILL.md");

    // Create resource directories
    if (resources.length > 0) {
        try {
            await createResourceDirs(skillDir, skillName, skillTitle, resources, includeExamples);
        } catch (err) {
            console.error(`[ERROR] Error creating resource directories: ${err}`);
            return false;
        }
    }

    // Print next steps
    console.log(`\n[OK] Skill '${skillName}' initialized successfully at ${skillDir}`);
    console.log("\nNext steps:");
    console.log("1. Edit SKILL.md to complete the TODO items and update the description");
    if (resources.length > 0) {
        if (includeExamples) {
            console.log("2. Customize or delete the example files in scripts/, references/, and assets/");
        } else {
            console.log("2. Add resources to scripts/, references/, and assets/ as needed");
        }
    } else {
        console.log("2. Create resource directories only if needed (scripts/, references/, assets/)");
    }
    console.log("3. Run the validator when ready to check the skill structure");

    return true;
}

async function main(): Promise<number> {
    const args = parseArgs({
        options: {
            path: { type: "string", required: true },
            resources: { type: "string", default: "" },
            examples: { type: "boolean", default: false },
        },
        allowPositionals: true,
    });

    const positionals = args.positionals || [];
    if (positionals.length === 0) {
        console.error("[ERROR] Skill name is required");
        console.error("Usage: init_skill.ts <skill-name> --path <path> [--resources scripts,references,assets] [--examples]");
        return 1;
    }

    const rawSkillName = positionals[0];
    const skillName = normalizeSkillName(rawSkillName);
    
    if (!skillName) {
        console.error("[ERROR] Skill name must include at least one letter or digit.");
        return 1;
    }
    if (skillName.length > MAX_SKILL_NAME_LENGTH) {
        console.error(`[ERROR] Skill name '${skillName}' is too long (${skillName.length} characters). Maximum is ${MAX_SKILL_NAME_LENGTH}.`);
        return 1;
    }
    if (skillName !== rawSkillName) {
        console.log(`Note: Normalized skill name from '${rawSkillName}' to '${skillName}'.`);
    }

    const resources = parseResources(args.values.resources || "");
    const includeExamples = !!args.values.examples;
    const path = args.values.path;

    if (includeExamples && resources.length === 0) {
        console.error("[ERROR] --examples requires --resources to be set.");
        return 1;
    }

    console.log(`Initializing skill: ${skillName}`);
    console.log(`   Location: ${path}`);
    if (resources.length > 0) {
        console.log(`   Resources: ${resources.join(", ")}`);
        if (includeExamples) console.log("   Examples: enabled");
    } else {
        console.log("   Resources: none (create as needed)");
    }
    console.log();

    const success = await initSkill(skillName, path, resources, includeExamples);
    return success ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    process.exit(await main());
}