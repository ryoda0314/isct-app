// 試験の自分用の修正（campus-sns/myExams.js の exam_prefs_v1）を React から読む・書く。
// 別の画面で直したときもそろうよう、保存のたびに "exam-prefs-changed" を投げて全部の hook が読み直す。
import { useState, useEffect, useCallback } from "react";
import { loadExamPrefs, saveExamPrefs } from "../myExams.js";

export function useExamPrefs() {
  const [prefs, setPrefs] = useState(loadExamPrefs);
  useEffect(() => {
    const reload = () => setPrefs(loadExamPrefs());
    window.addEventListener("exam-prefs-changed", reload);
    window.addEventListener("storage", reload);
    return () => {
      window.removeEventListener("exam-prefs-changed", reload);
      window.removeEventListener("storage", reload);
    };
  }, []);
  /** update(prefs => 新しい prefs) */
  const update = useCallback((fn) => {
    const next = fn(loadExamPrefs());
    saveExamPrefs(next);
    setPrefs(next);
  }, []);
  return [prefs, update];
}
