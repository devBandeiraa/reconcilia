// gifenc não publica tipos; só o que o script de capturas usa.
declare module 'gifenc' {
  type Palette = number[][];
  interface Encoder {
    writeFrame(
      index: Uint8Array,
      width: number,
      height: number,
      options?: { palette?: Palette; delay?: number; repeat?: number },
    ): void;
    finish(): void;
    bytes(): Uint8Array;
  }
  // Funções soltas (não métodos): o script as desestrutura do export default.
  const gifenc: {
    GIFEncoder: () => Encoder;
    quantize: (rgba: Uint8Array, maxColors: number) => Palette;
    applyPalette: (rgba: Uint8Array, palette: Palette) => Uint8Array;
  };
  export default gifenc;
}
