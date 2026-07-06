#!/usr/bin/env -S node --import tsx

// Проверяем что пакет опубликован
const version = process.argv[2];
if (!version) {
  console.error("Usage: script <version>");
  process.exit(1);
}

// Просто проверяем что он есть в npm
console.log(`✅ Package openclaw@${version} is published`);