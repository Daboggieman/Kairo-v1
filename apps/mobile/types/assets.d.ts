/**
 * Image imports.
 *
 * Metro turns `import logo from './logo.png'` into an asset registry id — a number — which is
 * exactly what `Image`'s `source` accepts. TypeScript has no idea, and neither Expo nor React
 * Native ships a declaration for it, so without this the only way to reach an asset is `require()`
 * with an eslint suppression on top. Declaring it keeps asset use a plain import.
 */

declare module '*.png' {
  const source: number;
  export default source;
}

declare module '*.jpg' {
  const source: number;
  export default source;
}
