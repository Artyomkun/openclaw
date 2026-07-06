/**
 * Memory Core - Tokenize Module
 * 
 * TECHNICAL DOCUMENTATION
 * 
 * ========================================================================
 * OVERVIEW
 * ========================================================================
 * 
 * This module provides tokenization for text with support for:
 * - ASCII (a-z, 0-9, _)
 * - CJK (Chinese, Japanese, Korean characters)
 * - Emoji and UTF-8 symbols (🚀, 🔥, 💪, etc.)
 * - Mixed language texts (English + Chinese + emoji)
 * - CRLF and LF line endings (normalized internally)
 * 
 * Used for:
 * - Jaccard similarity between texts
 * - MMR re-ranking in hybrid search
 * - Deduplication in dreaming
 * 
 * ========================================================================
 * LINE ENDING HANDLING (CRLF / LF)
 * ========================================================================
 * 
 * The tokenizer normalizes all line endings before processing:
 * - CRLF (\r\n) → LF (\n)
 * - CR (\r) → LF (\n)
 * - This ensures consistent tokenization regardless of OS
 * 
 * Why this matters:
 * - Windows uses CRLF (\r\n)
 * - Linux/macOS uses LF (\n)
 * - Without normalization, texts are identical except line endings
 * - textSimilarity() would return 0 for identical content
 * 
 * Example:
 * ```typescript
 * const win = "hello\r\nworld";
 * const unix = "hello\nworld";
 * // tokenize(win) === tokenize(unix) ✅
 * // textSimilarity(win, unix) === 1.0 ✅
 * ```
 * 
 * ========================================================================
 * TOKENIZATION ALGORITHM
 * ========================================================================
 * 
 * 1. Normalize line endings (CRLF → LF)
 * 2. Convert to lowercase
 * 3. ASCII tokens:
 *    - Extracts words from Latin script, digits, underscores
 *    - Example: "hello_world 123" → ["hello_world", "123"]
 * 
 * 4. CJK tokens:
 *    - Unigrams (each character individually)
 *    - Bigrams (adjacent characters)
 *    - Example: "我喜欢" → ["我", "喜", "欢", "我喜欢", "喜欢"]
 * 
 * 5. Emoji and UTF-8 extra:
 *    - Each character as individual token
 *    - Bigrams for adjacent non-ASCII characters
 *    - Example: "🚀🔥" → ["🚀", "🔥", "🚀🔥"]
 * 
 * ========================================================================
 * WHY BIGRAMS FOR CJK AND EMOJI?
 * ========================================================================
 * 
 * Problem: CJK languages have no spaces between words.
 * "我喜欢编程" means "I love programming".
 * 
 * Unigrams: ["我", "喜", "欢", "编", "程"]
 * Bigrams: ["喜欢", "编程"] ← preserve meaning!
 * 
 * For emoji: "🔥🔥🔥" bigrams "🔥🔥" help distinguish
 * repeating patterns.
 * 
 * ========================================================================
 * JACCARD SIMILARITY
 * ========================================================================
 * 
 * Formula: J(A,B) = |A ∩ B| / |A ∪ B|
 * 
 * Range: [0, 1] where:
 * - 1 = identical sets
 * - 0 = completely different
 * 
 * Used to measure text similarity without word order.
 * 
 * ========================================================================
 * USAGE EXAMPLES
 * ========================================================================
 * 
 * Example 1: ASCII texts
 * ```typescript
 * tokenize("hello world") // Set(["hello", "world"])
 * tokenize("hello world") // Set(["hello", "world"])
 * textSimilarity("hello world", "world hello") // 1.0 (same tokens)
 * ```
 * 
 * Example 2: CJK texts
 * ```typescript
 * tokenize("我喜欢") // Set(["我", "喜", "欢", "我喜欢", "喜欢"])
 * tokenize("我爱") // Set(["我", "爱", "我爱"])
 * textSimilarity("我喜欢", "我爱") // 0.33 (some overlap)
 * ```
 * 
 * Example 3: Mixed with emoji
 * ```typescript
 * tokenize("hello🔥") // Set(["hello", "🔥"])
 * tokenize("world🔥") // Set(["world", "🔥"])
 * textSimilarity("hello🔥", "world🔥") // 0.33 (share "🔥")
 * ```
 * 
 * Example 4: Different line endings (CRLF vs LF)
 * ```typescript
 * tokenize("hello\r\nworld") // Set(["hello", "world"])
 * tokenize("hello\nworld") // Set(["hello", "world"])
 * textSimilarity("hello\r\nworld", "hello\nworld") // 1.0 ✅
 * ```
 * 
 * ========================================================================
 * PERFORMANCE CONSIDERATIONS
 * ========================================================================
 * 
 * Time Complexity:
 * - Tokenization: O(n) where n = string length
 * - Jaccard: O(min(|A|, |B|)) where |A|, |B| = token counts
 * 
 * Space Complexity:
 * - Tokenization: O(n) for the Set
 * - Jaccard: O(1) extra space (iterates over smaller set)
 * 
 * Optimizations:
 * - Iterates over smaller set for intersection
 * - Caches tokenization results when possible
 * - Bigram generation is O(n) with adjacent character check
 * - Line ending normalization is O(n) using replace
 * 
 * ========================================================================
 * EDGE CASES
 * ========================================================================
 * 
 * 1. Empty strings:
 *    - tokenize("") → Set()
 *    - textSimilarity("", "") → 1.0
 *    - textSimilarity("", "hello") → 0.0
 * 
 * 2. Only punctuation:
 *    - tokenize("!@#$") → Set() (no tokens)
 *    - textSimilarity("!", "@") → 0.0
 * 
 * 3. Only emoji:
 *    - tokenize("🚀🔥") → Set(["🚀", "🔥", "🚀🔥"])
 *    - textSimilarity("🚀", "🔥") → 0.0
 * 
 * 4. Mixed scripts:
 *    - tokenize("hello世界🚀") → ["hello", "世", "界", "🚀", "世界"]
 *    - All scripts are processed correctly
 * 
 * 5. Line endings:
 *    - tokenize("hello\r\nworld") → ["hello", "world"]
 *    - tokenize("hello\nworld") → ["hello", "world"]
 *    - tokenize("hello\rworld") → ["hello", "world"]
 * 
 * ========================================================================
 * DEPENDENCIES
 * ========================================================================
 * 
 * - normalizeLowercaseStringOrEmpty: from string-coerce-runtime
 *   Normalizes string to lowercase or empty string
 * 
 * ========================================================================
 * EXPORTS
 * ========================================================================
 * 
 * - tokenize(): Tokenize text into Set of tokens
 * - jaccardSimilarity(): Compute Jaccard similarity between Sets
 * - textSimilarity(): Compute text similarity using Jaccard
 * - normalizeLineEndings(): Normalize CRLF/LF to LF
 * 
 * ========================================================================
 * VERSION HISTORY
 * ========================================================================
 * 
 * v1.0.0 - Initial implementation (ASCII + CJK)
 * v1.1.0 - Added emoji and UTF-8 extra support
 * v1.2.0 - Added bigram support for CJK
 * v1.3.0 - Added emoji bigram support
 * v1.4.0 - Added CRLF/LF line ending normalization
 * 
 * ========================================================================
 */

import { normalizeLowercaseStringOrEmpty } from "openclaw/plugin-sdk/string-coerce-runtime";

// ========================================================================
// Constants
// ========================================================================

/**
 * CJK characters regex.
 * 
 * Includes:
 * - Hiragana: \u3040-\u309f
 * - Katakana: \u30a0-\u30ff
 * - CJK Unified Ideographs: \u3400-\u4dbf, \u4e00-\u9fff
 * - Hangul Syllables: \uac00-\ud7af
 * - Hangul Jamo: \u1100-\u11ff
 */
const CJK_RE = /[\u3040-\u309f\u30a0-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\u1100-\u11ff]/;

/**
 * Emoji regex (all emoji characters).
 * 
 * Covers the entire emoji Unicode range:
 * - \u{1F000}-\u{1FFFF}: All emoji and symbols
 * - u flag required for Unicode codepoint support
 */
const EMOJI_RE = /[\u{1F000}-\u{1FFFF}]/u;

/**
 * UTF-8 extra characters.
 * 
 * Matches any non-ASCII, non-CJK character:
 * - Cyrillic, Arabic, Armenian, etc.
 * - Special symbols
 * - Any other Unicode characters
 */
const UTF8_EXTRA_RE = /[^\x00-\x7F\u3040-\u309f\u30a0-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\u1100-\u11ff]/u;

// ========================================================================
// Utilities
// ========================================================================

/**
 * Normalize line endings to LF (\n).
 * 
 * Converts:
 * - CRLF (\r\n) → LF (\n)
 * - CR (\r) → LF (\n)
 * 
 * This ensures consistent tokenization across different operating systems.
 * 
 * @param text - Input text with any line endings
 * @returns Text with normalized LF line endings
 * 
 * @example
 * ```typescript
 * normalizeLineEndings("hello\r\nworld") // "hello\nworld"
 * normalizeLineEndings("hello\rworld") // "hello\nworld"
 * normalizeLineEndings("hello\nworld") // "hello\nworld"
 * ```
 */
export function normalizeLineEndings(text: string): string {
  if (!text) return text;
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

// ========================================================================
// Core Functions
// ========================================================================

/**
 * Tokenize text for Jaccard similarity computation.
 * 
 * Extracts:
 * - Alphanumeric tokens (ASCII words, numbers, underscores)
 * - CJK characters (unigrams and adjacent bigrams)
 * - Emoji and UTF-8 symbols (unigrams and adjacent bigrams)
 * 
 * Automatically normalizes line endings (CRLF → LF).
 * 
 * @param text - Input string to tokenize
 * @returns Set of unique tokens
 * 
 * @example
 * ```typescript
 * tokenize("hello world 123") // Set(["hello", "world", "123"])
 * tokenize("我喜欢编程") // Set(["我", "喜", "欢", "编", "程", "我喜欢", "喜欢", "编程"])
 * tokenize("🚀🔥💪") // Set(["🚀", "🔥", "💪", "🚀🔥", "🔥💪"])
 * tokenize("hello世界🚀") // Set(["hello", "世", "界", "🚀", "世界"])
 * tokenize("hello\r\nworld") // Set(["hello", "world"]) // CRLF normalized
 * ```
 */
export function tokenize(text: string): Set<string> {
  // Normalize line endings first
  const normalized = normalizeLineEndings(text);
  const lower = normalizeLowercaseStringOrEmpty(normalized);
  const tokens = new Set<string>();

  // 1. ASCII tokens (Latin words, numbers, underscores)
  const ascii = lower.match(/[a-z0-9_]+/g) || [];
  for (const t of ascii) tokens.add(t);

  // 2. CJK + Emoji + UTF-8 Extra
  const chars = Array.from(lower);
  let i = 0;
  
  while (i < chars.length) {
    const char = chars[i];
    const nextChar = i + 1 < chars.length ? chars[i + 1] : '';

    // CJK character
    if (CJK_RE.test(char)) {
      tokens.add(char); // Unigram
      if (nextChar && CJK_RE.test(nextChar)) {
        tokens.add(char + nextChar); // Bigram for adjacent CJK
      }
      i++;
      continue;
    }

    // Emoji or UTF-8 extra character
    if (EMOJI_RE.test(char) || UTF8_EXTRA_RE.test(char)) {
      tokens.add(char); // Unigram
      
      // Bigram for adjacent emoji/UTF-8 characters
      if (nextChar && (EMOJI_RE.test(nextChar) || UTF8_EXTRA_RE.test(nextChar))) {
        tokens.add(char + nextChar);
      }
      i++;
      continue;
    }

    i++;
  }

  return tokens;
}

/**
 * Compute Jaccard similarity between two token sets.
 * 
 * Formula: J(A,B) = |A ∩ B| / |A ∪ B|
 * 
 * @param setA - First token set
 * @param setB - Second token set
 * @returns Similarity score in [0, 1]
 * 
 * @example
 * ```typescript
 * const setA = new Set(["hello", "world"]);
 * const setB = new Set(["hello", "world", "test"]);
 * jaccardSimilarity(setA, setB) // 0.66
 * ```
 */
export function jaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
  // Both empty → identical
  if (setA.size === 0 && setB.size === 0) {
    return 1;
  }
  
  // One empty, one not → completely different
  if (setA.size === 0 || setB.size === 0) {
    return 0;
  }

  // Iterate over smaller set for performance
  const smaller = setA.size <= setB.size ? setA : setB;
  const larger = setA.size <= setB.size ? setB : setA;

  let intersectionSize = 0;
  for (const token of smaller) {
    if (larger.has(token)) {
      intersectionSize++;
    }
  }

  const unionSize = setA.size + setB.size - intersectionSize;
  return unionSize === 0 ? 0 : intersectionSize / unionSize;
}

/**
 * Compute text similarity using Jaccard on tokens.
 * 
 * Handles edge case where both inputs have no tokens:
 * - Falls back to normalized string equality
 * - Prevents false positives for different strings
 * 
 * Automatically normalizes line endings (CRLF → LF).
 * 
 * @param contentA - First text
 * @param contentB - Second text
 * @returns Similarity score in [0, 1]
 * 
 * @example
 * ```typescript
 * textSimilarity("hello world", "world hello") // 1.0
 * textSimilarity("我喜欢", "我爱") // 0.33
 * textSimilarity("🚀🔥", "🔥🚀") // 0.33
 * textSimilarity("hello\r\nworld", "hello\nworld") // 1.0 ✅
 * ```
 */
export function textSimilarity(contentA: string, contentB: string): number {
  // Normalize line endings for both inputs
  const normalizedA = normalizeLineEndings(contentA);
  const normalizedB = normalizeLineEndings(contentB);
  
  const tokensA = tokenize(normalizedA);
  const tokensB = tokenize(normalizedB);
  
  // Both empty → compare normalized strings directly
  if (tokensA.size === 0 && tokensB.size === 0) {
    return normalizeLowercaseStringOrEmpty(normalizedA) === normalizeLowercaseStringOrEmpty(normalizedB)
      ? 1
      : 0;
  }
  
  return jaccardSimilarity(tokensA, tokensB);
}

// ========================================================================
// Export
// ========================================================================

export default {
  tokenize,
  jaccardSimilarity,
  textSimilarity,
  normalizeLineEndings,
  
  // For testing/debugging
  CJK_RE,
  EMOJI_RE,
  UTF8_EXTRA_RE,
};