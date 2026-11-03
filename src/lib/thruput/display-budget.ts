const encoder = new TextEncoder();
const decoder = new TextDecoder();
export const TRUNCATED = "… [truncated]";
export const VALUE_BYTES = 4096;
export const PAGE_BYTES = 256 * 1024;

/** Shared by optional spec/call enrichment for one page. */
export class DisplayBudget {
  remaining = PAGE_BYTES;
  truncated = false;

  text(value: string): string {
    return this.format((write) => write(value));
  }

  /** Stop traversal as soon as the UTF-8 budget is exhausted, before joining. */
  format(render: (write: (part: string) => void) => void): string {
    const limit = Math.min(VALUE_BYTES, this.remaining);
    if (limit < 32) {
      this.truncated = true;
      return "";
    }
    let available = limit - encoder.encode(TRUNCATED).length;
    const parts: string[] = [];
    const stop = Symbol();
    try {
      render((part) => {
        // Slice before encoding: even a very long name has bounded temporary cost.
        const bytes = encoder.encode(part.slice(0, available + 1));
        if (bytes.length > available || part.length > available + 1) {
          let end = Math.min(bytes.length, available);
          while (end > 0 && (bytes[end] & 0xc0) === 0x80) end--;
          parts.push(decoder.decode(bytes.subarray(0, end)));
          throw stop;
        }
        parts.push(part);
        available -= bytes.length;
      });
    } catch (error) {
      if (error !== stop) throw error;
      parts.push(TRUNCATED);
      this.truncated = true;
    }
    const text = parts.join("");
    this.remaining -= encoder.encode(text).length;
    return text;
  }

  rows<T, U>(items: readonly T[], render: (item: T) => U): U[] {
    const result: U[] = [];
    for (const item of items) {
      if (this.remaining < 256 || result.length >= 128) {
        this.truncated = true;
        break;
      }
      // Bound row overhead too, including empty values and React serialization.
      this.remaining -= 128;
      result.push(render(item));
    }
    return result;
  }
}
