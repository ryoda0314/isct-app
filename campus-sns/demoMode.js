// グローバルデモモードフラグ
let _demo = false;
let _ssMode = false;
export const isDemoMode = () => _demo;
export const isScreenshotMode = () => _ssMode;
export const setDemoMode = (v) => { _demo = !!v; if (!v) _ssMode = false; };
export const setScreenshotMode = (v) => { _ssMode = !!v; };
