// Shared shape for the GPU (regl) waterfall and the 2D-canvas fallback, so the
// app can use whichever initializes on the device.
export interface WaterfallLike {
  pushRow(values01: Float32Array, trust: Uint8Array): void;
  setProvenance(on: boolean): void;
  resize(): void;
  render(): void;
  dispose(): void;
}
