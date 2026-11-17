// Types minimaux du moteur de gravure Verovio (le paquet n'en fournit pas).
declare module 'verovio/esm' {
  export class VerovioToolkit {
    constructor(module: unknown);
    setOptions(o: Record<string, unknown>): void;
    loadData(data: string): boolean;
    getPageCount(): number;
    renderToSVG(page?: number, xmlDeclaration?: boolean): string;
    renderToTimemap(o?: Record<string, unknown>): unknown[];
    getLog(): string;
  }
}
declare module 'verovio/wasm' {
  const creerModule: () => Promise<unknown>;
  export default creerModule;
}
