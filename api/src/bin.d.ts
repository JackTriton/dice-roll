// wrangler の Data モジュール(.bin は ArrayBuffer として読み込まれる)
declare module '*.bin' {
  const data: ArrayBuffer;
  export default data;
}
