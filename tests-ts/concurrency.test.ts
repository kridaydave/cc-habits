import { describe, it, expect } from 'vitest';
import { mapWithConcurrencyLimit } from '../src/concurrency';

describe('mapWithConcurrencyLimit', () => {
  it('never lets peak in-flight work exceed the limit', async () => {
    const items = Array.from({ length: 50 }, (_, i) => i);
    const limit = 4;

    let live = 0;
    let peak = 0;

    await mapWithConcurrencyLimit(items, limit, async () => {
      live++;
      peak = Math.max(peak, live);
      // Yield so sibling workers get a turn to start, exercising the bound.
      await new Promise<void>(resolve => setTimeout(resolve, 0));
      live--;
      return null;
    });

    // The pool must never spawn more than `limit` workers at once.
    expect(peak).toBeLessThanOrEqual(limit);
    // Sanity: work actually ran concurrently (otherwise the bound is vacuous).
    expect(peak).toBeGreaterThan(1);
  });

  it('returns results in input order even when workers resolve out of order', async () => {
    const items = ['a', 'b', 'c', 'd', 'e', 'f'];
    const resolveOrder: number[] = [];

    // Later indices finish sooner, so workers resolve well out of input order.
    // A concurrency limit below the item count guarantees overlapping batches.
    const results = await mapWithConcurrencyLimit(items, 3, async (item, index) => {
      const delay = (items.length - index) * 15;
      await new Promise<void>(resolve => setTimeout(resolve, delay));
      resolveOrder.push(index);
      return item.toUpperCase();
    });

    // Workers genuinely resolved out of input order...
    expect(resolveOrder).not.toEqual(items.map((_, i) => i));
    // ...yet every result lands at its input index.
    expect(results).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
  });
});
