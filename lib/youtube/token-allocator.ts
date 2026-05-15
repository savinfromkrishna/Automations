import { listValidHfKeys } from "../synthesize";

/**
 * Round-robin token allocator that distributes media generation requests
 * across the user's HF token pool, so a 10-scene video doesn't pile all
 * 10 image requests onto the same token's credit budget.
 *
 * Usage:
 *   const allocator = await TokenAllocator.create();
 *   const token1 = allocator.next(); // token[0]
 *   const token2 = allocator.next(); // token[1]
 *   ...
 *   // After all keys used, wraps around to token[0] again.
 */
export class TokenAllocator {
  private keys: string[];
  private cursor: number;

  private constructor(keys: string[], cursor = 0) {
    this.keys = keys;
    this.cursor = cursor;
  }

  static async create(): Promise<TokenAllocator> {
    const keys = await listValidHfKeys();
    return new TokenAllocator(keys);
  }

  static fromKeys(keys: string[]): TokenAllocator {
    return new TokenAllocator(keys);
  }

  /** Returns the next token in rotation, or undefined if the pool is empty. */
  next(): string | undefined {
    if (this.keys.length === 0) return undefined;
    const key = this.keys[this.cursor % this.keys.length];
    this.cursor++;
    return key;
  }

  /** Returns the token at index i (mod pool size). Useful for deterministic
   *  per-scene assignment so scene N always uses the same token across retries. */
  at(i: number): string | undefined {
    if (this.keys.length === 0) return undefined;
    return this.keys[i % this.keys.length];
  }

  count(): number {
    return this.keys.length;
  }

  list(): string[] {
    return [...this.keys];
  }
}
