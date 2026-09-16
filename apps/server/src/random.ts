import { randomInt, randomUUID } from 'node:crypto';

export interface MatchRandomSource {
  readonly uuid: () => string;
  readonly nextInt: (maxExclusive: number) => number;
}

export const cryptoMatchRandomSource: MatchRandomSource = {
  uuid: () => randomUUID(),
  nextInt: (maxExclusive) => randomInt(0, maxExclusive),
};

export function fisherYatesShuffle<T>(
  input: readonly T[],
  random: MatchRandomSource,
): T[] {
  const result = [...input];

  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = random.nextInt(index + 1);
    if (!Number.isInteger(swapIndex) || swapIndex < 0 || swapIndex > index) {
      throw new RangeError(
        `Random source returned ${String(swapIndex)} for exclusive bound ${String(index + 1)}.`,
      );
    }

    const current = result[index];
    const other = result[swapIndex];
    if (current === undefined || other === undefined) {
      throw new Error('Fisher-Yates encountered an impossible missing array element.');
    }
    result[index] = other;
    result[swapIndex] = current;
  }

  return result;
}
