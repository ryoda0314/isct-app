import React, { useState, useMemo, useEffect } from "react";
import { t, locName } from "../i18n.js";
import { T } from "../theme.js";
import { SCHOOLS, DEPTS } from "../data.js";
import { updateUserPref } from "../hooks/useCurrentUser.js";
import { MatrixInput, COLS, ROWS } from "./MatrixInput.jsx";

// 学籍番号パーサー共通
const SCHOOL_NUM_MAP = {
  "0": "science", "1": "engineering", "2": "matsci",
  "3": "computing", "4": "lifesci", "5": "envsoc",
};
const MED_NEW_MAP = {
  "1": { schoolKey: "medicine",  deptKey: "MED_M" },
  "2": { schoolKey: "medicine",  deptKey: "MED_N" },
  "3": { schoolKey: "medicine",  deptKey: "MED_T" },
  "5": { schoolKey: "dentistry", deptKey: "DEN_D" },
  "6": { schoolKey: "dentistry", deptKey: "DEN_H" },
  "7": { schoolKey: "dentistry", deptKey: "DEN_E" },
};
const MED_LEGACY_MAP = {
  "11": { schoolKey: "medicine",  deptKey: "MED_M" },
  "21": { schoolKey: "medicine",  deptKey: "MED_N" },
  "22": { schoolKey: "medicine",  deptKey: "MED_T" },
  "31": { schoolKey: "dentistry", deptKey: "DEN_D" },
  "32": { schoolKey: "dentistry", deptKey: "DEN_H" },
  "39": { schoolKey: "dentistry", deptKey: "DEN_E" },
};

function parseStudentId(id) {
  if (!id || id.length < 4) return null;
  const m = id.match(/^(\d{2})([BMDR])(\d)(\d)?/i);
  if (m) {
    const schoolNum = m[3];
    const subNum = m[4] || null;
    const medInfo = schoolNum === "6" && subNum ? MED_NEW_MAP[subNum] : null;
    const schoolKey = medInfo ? medInfo.schoolKey : (SCHOOL_NUM_MAP[schoolNum] || null);
    const deptKey = medInfo ? medInfo.deptKey : null;
    return { yearGroup: m[1] + m[2].toUpperCase(), degree: m[2].toUpperCase(), schoolKey, deptKey, isMedDental: schoolNum === "6" };
  }
  const mL = id.match(/^(\d{2})(\d{2})\d{4}$/);
  if (mL) {
    const info = MED_LEGACY_MAP[mL[1]];
    if (info) return { yearGroup: mL[2] + "B", degree: "B", ...info, isMedDental: true };
  }
  return null;
}

function calcGrade(yearGroup) {
  if (!yearGroup) return null;
  const ey = 2000 + parseInt(yearGroup.slice(0, 2));
  const now = new Date();
  const ay = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return Math.max(1, ay - ey + 1);
}

export const DeptModal = ({ user, onClose }) => {
  const initSchool = user.school && SCHOOLS[user.school] ? user.school : null;
  const isMedInit = initSchool === "medicine" || initSchool === "dentistry";

  const [mode, setMode] = useState(isMedInit ? "med" : null);

  // 医歯学系: 学籍番号
  const [medStudentId, setMedStudentId] = useState("");
  const [medParsed, setMedParsed] = useState(null);

  // 理工学系: Titech Portal 登録
  const [portalId, setPortalId] = useState("");
  const [portalPw, setPortalPw] = useState("");
  const [matrix, setMatrix] = useState({});
  const [portalValidating, setPortalValidating] = useState(false);
  const [portalDone, setPortalDone] = useState(false);

  // 理工学系: 学系選択（SetupView Step 3 を流用）
  const [setupDeptSchool, setSetupDeptSchool] = useState(null);
  const [setupDept, setSetupDept] = useState(null);
  const [setupTransfer, setSetupTransfer] = useState(false);

  // 共通: 認証状態
  const [authStatus, setAuthStatus] = useState(null);
  const [statusLoading, setStatusLoading] = useState(false);

  // 共通: メール認証
  const [email, setEmail] = useState("");
  const [emailPw, setEmailPw] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState("");
  const [emailVerified, setEmailVerified] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const matrixFilled = COLS.every(c => ROWS.every(r => matrix[c]?.[r]));
  const hasPortal = authStatus?.hasPortal === true || portalDone;
  const hasEmail = authStatus?.hasEmail === true || emailVerified;

  // Portal 認証後の学籍番号（既に持ってる or さっき入力した）
  const sciStudentId = user.studentId || portalId || null;
  const sciParsed = useMemo(() => parseStudentId(sciStudentId), [sciStudentId]);
  const sciSchool = sciParsed?.schoolKey || null; // 学籍番号から自動判定した学院

  // 学系選択: 転院時 or 通常時の表示対象学院
  const effectiveDeptSchool = setupTransfer ? setupDeptSchool : (setupDeptSchool || sciSchool);
  const depts = useMemo(() => {
    if (!effectiveDeptSchool) return [];
    return Object.entries(DEPTS).filter(([, d]) => d.school === effectiveDeptSchool);
  }, [effectiveDeptSchool]);

  const grade = calcGrade(sciParsed?.yearGroup || user.yearGroup);
  const isFirstYear = grade === 1 && (sciParsed?.degree || "B") === "B";

  // Portal認証済み → 学院を初期設定
  useEffect(() => {
    if (hasPortal && sciSchool && !setupDeptSchool) {
      setSetupDeptSchool(sciSchool);
    }
  }, [hasPortal, sciSchool]);

  // 医歯学: 学籍番号変更時に自動判定
  useEffect(() => {
    const p = medStudentId ? parseStudentId(medStudentId) : null;
    setMedParsed(p && p.isMedDental ? p : null);
    if (p) setError(null);
  }, [medStudentId]);

  // モード確定時に認証状態を取得
  useEffect(() => {
    if (!mode || authStatus) return;
    setStatusLoading(true);
    (async () => {
      try {
        const r = await fetch("/api/auth/status");
        const d = await r.json();
        setAuthStatus(d);
      } catch {
        setAuthStatus({ hasPortal: false, hasEmail: false });
      }
      setStatusLoading(false);
    })();
  }, [mode]);

  // 理工: Portal済 + 学系選択済 + メール済
  const sciDeptDone = mode === "sci" && hasPortal && setupDept;
  const canSaveSci = sciDeptDone && hasEmail;
  // 医歯: 学籍番号判定済 + メール済
  const canSaveMed = mode === "med" && medParsed && hasEmail;
  const canSave = canSaveSci || canSaveMed;

  // Titech Portal 検証
  const handlePortalValidate = async () => {
    if (!portalId || !portalPw || !matrixFilled) return;
    setPortalValidating(true); setError(null);
    try {
      const r = await fetch("/api/auth/validate/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ portalUserId: portalId, portalPassword: portalPw, matrix }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || t("deptmodal.errAuthFailed"));
      setPortalDone(true);
    } catch (e) { setError(e.message); }
    setPortalValidating(false);
  };

  const handleSave = async () => {
    if (!canSave) return;
    const sid = mode === "med" ? medStudentId : sciStudentId;
    const yg = mode === "med" ? medParsed?.yearGroup : (sciParsed?.yearGroup || null);
    if (sid || yg) {
      const patch = {};
      if (sid) patch.studentId = sid;
      if (yg) patch.yearGroup = yg;
      try {
        await fetch("/api/auth/me", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
      } catch {}
    }
    if (yg) updateUserPref({ yearGroup: yg });
    const deptKey = mode === "med" ? medParsed.deptKey : (setupDept !== "none" ? setupDept : null);
    if (deptKey) updateUserPref({ myDept: deptKey });
    onClose();
  };

  const handleSendCode = async () => {
    if (!email || !emailPw) { setError(t("deptmodal.errEmailPwRequired")); return; }
    if (emailPw.length < 8) { setError(t("deptmodal.errPwTooShort")); return; }
    setSaving(true); setError(null);
    try {
      const r = await fetch("/api/auth/email/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: emailPw }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || t("deptmodal.errSendFailed"));
      setCodeSent(true);
    } catch (e) { setError(e.message); }
    setSaving(false);
  };

  const handleVerifyCode = async () => {
    if (code.length !== 6) { setError(t("deptmodal.errCode6Digits")); return; }
    setSaving(true); setError(null);
    try {
      const r = await fetch("/api/auth/email/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || t("deptmodal.errAuthFailed"));
      setEmailVerified(true);
    } catch (e) { setError(e.message); }
    setSaving(false);
  };

  const resetEmailState = () => {
    setEmail(""); setEmailPw(""); setCodeSent(false); setCode(""); setEmailVerified(false); setError(null);
  };

  const btnStyle = (enabled) => ({
    padding: "12px 0", borderRadius: 10, border: "none", width: "100%",
    background: enabled ? T.accent : T.bd,
    color: enabled ? "#fff" : T.txD,
    fontSize: 14, fontWeight: 700, cursor: enabled ? "pointer" : "default",
    transition: "all .15s",
  });

  const inputStyle = {
    width: "100%", padding: "10px 12px", borderRadius: 8,
    border: `1px solid ${T.bd}`, background: T.bg3,
    color: T.txH, fontSize: 14, outline: "none", boxSizing: "border-box",
  };

  const chipStyle = (on, col) => ({
    padding: "7px 12px", borderRadius: 8,
    border: `1px solid ${on ? col : T.bd}`,
    background: on ? `${col}14` : "transparent",
    color: on ? col : T.txH,
    fontSize: 12, fontWeight: on ? 700 : 500, cursor: "pointer",
    transition: "all .15s",
  });

  const checkBadge = (label) => (
    <div style={{
      padding: 10, borderRadius: 10, marginBottom: 16,
      border: `1px solid ${T.green}30`, background: `${T.green}06`,
      display: "flex", alignItems: "center", gap: 8,
    }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.green} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      <span style={{ fontSize: 13, fontWeight: 600, color: T.green }}>{label}</span>
    </div>
  );

  const errorBox = (msg) => msg ? (
    <div style={{
      padding: "8px 12px", borderRadius: 8, marginBottom: 12,
      background: `${T.red}10`, border: `1px solid ${T.red}30`,
      fontSize: 12, color: T.red, lineHeight: 1.5,
    }}>{msg}</div>
  ) : null;

  // メール認証セクション（共通）
  const emailAuthSection = (show) => {
    if (!show) return null;
    if (hasEmail) return checkBadge(t("deptmodal.emailVerified"));
    return (
      <div style={{ padding: 16, borderRadius: 12, marginBottom: 16, border: `1px solid ${T.bd}`, background: T.bg3 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: T.txH, marginBottom: 4 }}>{t("deptmodal.emailAuthRequired")}</div>
        <p style={{ fontSize: 12, color: T.txD, margin: "0 0 12px", lineHeight: 1.5 }}>
          {t("deptmodal.emailAuthDesc")}
        </p>
        {errorBox(error)}
        {!codeSent ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: T.txD, marginBottom: 4, display: "block" }}>{t("deptmodal.emailLabel")}</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="example@m.isct.ac.jp" style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: T.txD, marginBottom: 4, display: "block" }}>{t("deptmodal.loginPwLabel")}</label>
              <input type="password" value={emailPw} onChange={e => setEmailPw(e.target.value)} placeholder={t("deptmodal.pwPlaceholder")} style={inputStyle} />
              <div style={{ fontSize: 11, color: T.txD, marginTop: 4 }}>{t("deptmodal.appPwNote")}</div>
            </div>
            <button onClick={handleSendCode} disabled={saving || !email || !emailPw} style={btnStyle(email && emailPw && !saving)}>
              {saving ? t("deptmodal.sending") : t("deptmodal.sendCode")}
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <p style={{ fontSize: 12, color: T.txD, lineHeight: 1.5 }}>
              <strong style={{ color: T.txH }}>{email}</strong> {t("deptmodal.codeSentTo")}
            </p>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: T.txD, marginBottom: 4, display: "block" }}>{t("deptmodal.codeLabel")}</label>
              <input type="text" inputMode="numeric" value={code}
                onChange={e => setCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
                placeholder="123456"
                style={{ ...inputStyle, fontFamily: "monospace", letterSpacing: 4, textAlign: "center", fontSize: 18 }} />
            </div>
            <button onClick={handleVerifyCode} disabled={saving || code.length !== 6} style={btnStyle(code.length === 6 && !saving)}>
              {saving ? t("deptmodal.verifying") : t("deptmodal.verify")}
            </button>
            <button onClick={() => { setCodeSent(false); setCode(""); setError(null); }}
              style={{ background: "none", border: "none", color: T.txD, fontSize: 11, cursor: "pointer", padding: "2px 0" }}>
              {t("deptmodal.changeEmail")}
            </button>
          </div>
        )}
      </div>
    );
  };

  // 学系選択セクション（SetupView Step 3 流用）
  const deptPickerSection = () => {
    if (!hasPortal) return null;
    const sd = effectiveDeptSchool ? SCHOOLS[effectiveDeptSchool] : null;
    const showSchoolPicker = !sciSchool || setupTransfer;

    return (
      <div style={{ padding: 14, borderRadius: 12, marginBottom: 16, border: `1px solid ${T.bd}`, background: T.bg3 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: T.txD }}>
            {isFirstYear ? t("deptmodal.desiredDept") : t("deptmodal.belongDept")}
          </label>
          {sd && !showSchoolPicker && (
            <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 6, background: `${sd.col}14`, color: sd.col }}>
              {locName(sd)}
            </span>
          )}
        </div>

        {/* 転院モード or 学院未判定: 学院選択 */}
        {showSchoolPicker && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 500, color: T.txD, marginBottom: 6 }}>{t("deptmodal.school")}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {Object.entries(SCHOOLS).filter(([sk]) => sk !== "medicine" && sk !== "dentistry").map(([sk, sv]) => (
                <button key={sk} onClick={() => { setSetupDeptSchool(sk); setSetupDept(null); }}
                  style={chipStyle(setupDeptSchool === sk, sv.col)}>{locName(sv)}</button>
              ))}
            </div>
            {setupTransfer && (
              <button onClick={() => { setSetupTransfer(false); setSetupDeptSchool(sciSchool); setSetupDept(null); }}
                style={{ background: "none", border: "none", color: T.txD, fontSize: 11, cursor: "pointer", padding: "6px 0 0" }}>
                {t("common.cancel")}
              </button>
            )}
          </div>
        )}

        {/* 学系ボタン */}
        {depts.length > 0 && (
          <div>
            {showSchoolPicker && <div style={{ fontSize: 11, fontWeight: 500, color: T.txD, marginBottom: 6 }}>{t("deptmodal.dept")}</div>}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {depts.map(([prefix, d]) => {
                const sel = setupDept === prefix;
                return (
                  <button key={prefix} onClick={() => setSetupDept(sel ? null : prefix)}
                    style={{
                      padding: "8px 16px", borderRadius: 8,
                      border: `1px solid ${sel ? d.col : T.bd}`,
                      background: sel ? `${d.col}14` : "transparent",
                      color: sel ? d.col : T.txH,
                      fontSize: 13, fontWeight: sel ? 700 : 500, cursor: "pointer",
                      transition: "all .15s",
                    }}>{locName(d)}</button>
                );
              })}
              {!isFirstYear && (
                <button onClick={() => setSetupDept(setupDept === "none" ? null : "none")}
                  style={{
                    padding: "8px 16px", borderRadius: 8,
                    border: `1px solid ${setupDept === "none" ? T.txD : T.bd}`,
                    background: setupDept === "none" ? `${T.txD}14` : "transparent",
                    color: T.txD,
                    fontSize: 13, fontWeight: setupDept === "none" ? 700 : 500, cursor: "pointer",
                    transition: "all .15s",
                  }}>{t("deptmodal.unaffiliated")}</button>
              )}
            </div>
          </div>
        )}

        {/* 転院ボタン */}
        {!isFirstYear && !setupTransfer && sciSchool && (
          <button onClick={() => { setSetupTransfer(true); setSetupDept(null); }}
            style={{
              background: "none", border: "none", color: T.accent,
              fontSize: 12, fontWeight: 500, cursor: "pointer",
              padding: "6px 0 0", textAlign: "left", display: "flex", alignItems: "center", gap: 4,
            }}>
            {t("deptmodal.transferHere")}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        )}
      </div>
    );
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "rgba(0,0,0,0.5)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 16,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: "100%", maxWidth: 420, borderRadius: 16,
        background: T.bg2, border: `1px solid ${T.bd}`,
        padding: 24, boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
        maxHeight: "80dvh", overflowY: "auto",
      }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: T.txH, margin: "0 0 4px" }}>{t("deptmodal.title")}</h2>
        <p style={{ fontSize: 13, color: T.txD, margin: "0 0 20px", lineHeight: 1.5 }}>
          {t("deptmodal.titleDesc")}
        </p>

        {/* モード選択 */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: T.txD, marginBottom: 6, display: "block" }}>{t("deptmodal.campus")}</label>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => { setMode("sci"); setSetupDept(null); setSetupTransfer(false); resetEmailState(); }}
              style={{ ...chipStyle(mode === "sci", "#6375f0"), flex: 1, padding: "10px 0", fontSize: 13 }}>
              {t("deptmodal.campusSci")}
            </button>
            <button onClick={() => { setMode("med"); setSetupDept(null); resetEmailState(); }}
              style={{ ...chipStyle(mode === "med", "#e04e6a"), flex: 1, padding: "10px 0", fontSize: 13 }}>
              {t("deptmodal.campusMed")}
            </button>
          </div>
        </div>

        {statusLoading && <div style={{ fontSize: 13, color: T.txD, marginBottom: 12 }}>{t("deptmodal.checkingAuth")}</div>}

        {/* === 理工学系 === */}
        {mode === "sci" && authStatus && (
          <>
            {/* Titech Portal 認証 */}
            {!hasPortal ? (
              <div style={{ padding: 16, borderRadius: 12, marginBottom: 16, border: `1px solid ${T.bd}`, background: T.bg3 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: T.txH, marginBottom: 4 }}>{t("deptmodal.portalAuth")}</div>
                <p style={{ fontSize: 12, color: T.txD, margin: "0 0 12px", lineHeight: 1.5 }}>{t("deptmodal.portalAuthDesc")}</p>
                {errorBox(error)}
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: T.txD, marginBottom: 4, display: "block" }}>{t("deptmodal.portalAccount")}</label>
                    <input type="text" value={portalId} onChange={e => setPortalId(e.target.value)}
                      placeholder={t("deptmodal.studentIdPlaceholder")} style={{ ...inputStyle, fontFamily: "monospace" }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: T.txD, marginBottom: 4, display: "block" }}>{t("deptmodal.portalPassword")}</label>
                    <input type="password" value={portalPw} onChange={e => setPortalPw(e.target.value)}
                      placeholder={t("deptmodal.portalPwPlaceholder")} style={inputStyle} />
                  </div>
                  <MatrixInput matrix={matrix} setMatrix={setMatrix} />
                  <button onClick={handlePortalValidate}
                    disabled={portalValidating || !portalId || !portalPw || !matrixFilled}
                    style={btnStyle(portalId && portalPw && matrixFilled && !portalValidating)}>
                    {portalValidating ? t("deptmodal.authenticating") : t("deptmodal.portalAuthBtn")}
                  </button>
                </div>
              </div>
            ) : (
              checkBadge(t("deptmodal.portalAuthDone"))
            )}

            {/* 学系選択（Portal認証後） */}
            {deptPickerSection()}

            {/* メール認証（学系選択後） */}
            {emailAuthSection(sciDeptDone)}
          </>
        )}

        {/* === 医歯学系 === */}
        {mode === "med" && authStatus && (
          <>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: T.txD, marginBottom: 6, display: "block" }}>{t("deptmodal.studentIdLabel")}</label>
              <input type="text" value={medStudentId} onChange={e => setMedStudentId(e.target.value.trim())}
                placeholder={t("deptmodal.medStudentIdPlaceholder")} style={inputStyle} />
              {medStudentId && !medParsed && (
                <div style={{ fontSize: 11, color: T.red, marginTop: 4 }}>{t("deptmodal.medIdNotRecognized")}</div>
              )}
              {medParsed && (
                <div style={{
                  marginTop: 8, padding: 10, borderRadius: 8,
                  background: `${SCHOOLS[medParsed.schoolKey]?.col || T.accent}10`,
                  border: `1px solid ${SCHOOLS[medParsed.schoolKey]?.col || T.accent}30`,
                }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: SCHOOLS[medParsed.schoolKey]?.col || T.txH }}>
                    {locName(SCHOOLS[medParsed.schoolKey])}
                  </span>
                  <span style={{ fontSize: 13, color: T.txD, margin: "0 6px" }}>/</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: T.txH }}>
                    {locName(DEPTS[medParsed.deptKey])}
                  </span>
                </div>
              )}
            </div>
            {emailAuthSection(!!medParsed)}
          </>
        )}

        {/* ボタン */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button onClick={handleSave} disabled={!canSave} style={btnStyle(canSave)}>{t("deptmodal.saveBtn")}</button>
        </div>
      </div>
    </div>
  );
};
