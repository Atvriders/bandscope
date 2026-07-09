// Trust-class encoding shared by the rasterizer and the GL texture. Kept
// dependency-free (no regl) so pure logic can import it in unit tests.

import { TrustClass } from '../core/model';

// Stored in the waterfall texture's green channel.
export const TRUST_MEASURED = 0;
export const TRUST_DERIVED = 128;
export const TRUST_CATEGORICAL = 255;

export function trustByte(t: TrustClass): number {
  if (t === TrustClass.MEASURED) return TRUST_MEASURED;
  if (t === TrustClass.DERIVED) return TRUST_DERIVED;
  return TRUST_CATEGORICAL;
}
