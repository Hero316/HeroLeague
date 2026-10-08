// Vite: `import x from 'datei?url'` liefert die URL des ausgelieferten Assets.
declare module '*?url' {
  const src: string;
  export default src;
}
