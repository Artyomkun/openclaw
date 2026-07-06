/**
 * Protocol Gen - Swift
 */

import { writeFileSync } from "node:fs";

const schemas = {
  User: { id: "string", name: "string" },
  Message: { id: "string", text: "string", userId: "string" },
};

function generateStruct(name: string, fields: Record<string, string>): string {
  const props = Object.entries(fields)
    .map(([key, type]) => `    public let ${key}: ${type}`)
    .join("\n");
  const init = Object.entries(fields)
    .map(([key]) => `        self.${key} = ${key}`)
    .join("\n");
  const params = Object.entries(fields)
    .map(([key, type]) => `        ${key}: ${type}`)
    .join(",\n");
  
  return `
public struct ${name}: Codable, Sendable {
${props}
    public init(
${params}
    ) {
${init}
    }
}`;
}

const result = Object.entries(schemas)
  .map(([name, fields]) => generateStruct(name, fields))
  .join("\n\n");

writeFileSync("Generated.swift", result);
console.log("✅ Generated Swift models");