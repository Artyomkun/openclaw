/**
 * Xiaomi - Stream Behavior
 * 
 * Простой стриминг для MiMo моделей без легаси.
 */

export function createMiMoThinkingWrapper(baseStreamFn: any): any {
  return async function* wrappedStream(...args: any[]) {
    const stream = baseStreamFn(...args);
    let buffer = "";

    for await (const chunk of stream) {
      if (chunk.reasoning) {
        buffer += chunk.reasoning;
        yield { text: chunk.reasoning };
      } else if (chunk.text) {
        buffer += chunk.text;
        yield { text: chunk.text };
      } else {
        yield chunk;
      }
    }
  };
}