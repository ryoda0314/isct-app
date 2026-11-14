// 管理者の操作ログ（admin_audit_log）。app/api/admin/route.js の auditLog と同じ書き方を、別のルートからも使えるようにしたもの。
// admin_id は NOT NULL なので、管理者として確認できた後に呼ぶこと。失敗しても操作自体は止めない。
export async function auditLog(sb, adminId, action, targetType, targetId, detail) {
  try {
    await sb.from('admin_audit_log').insert({
      admin_id: adminId, action, target_type: targetType,
      target_id: String(targetId || ''), detail: detail || null,
    });
  } catch (e) { console.error('[AuditLog]', e); }
}
