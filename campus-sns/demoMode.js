// グローバルデモモードフラグ
let _demo = false;
export const isDemoMode = () => _demo;
export const setDemoMode = (v) => { _demo = !!v; };
