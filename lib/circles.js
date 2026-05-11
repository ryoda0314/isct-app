import { getSupabaseAdmin } from './supabase/server.js';

const ADMIN_ROLE_NAME = '__admin__';

export function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function ensureAdminRole(sb, circleId) {
  const { data: existing } = await sb
    .from('circle_roles')
    .select('id')
    .eq('circle_id', circleId)
    .eq('name', ADMIN_ROLE_NAME)
    .maybeSingle();
  if (existing?.id) return existing.id;
  const id = newId('role');
  const { error } = await sb.from('circle_roles').insert({
    id,
    circle_id: circleId,
    name: ADMIN_ROLE_NAME,
    color: '#e5534b',
    sort_order: 0,
    can_manage_members: true,
    can_manage_channels: true,
    can_announce: true,
    can_manage_events: true,
    can_manage_recruit: true,
    can_pin: true,
  });
  if (error) throw error;
  return id;
}

export async function getCircleAuthz(sb, circleId, userid) {
  const { data: circle } = await sb
    .from('circles')
    .select('owner_id')
    .eq('id', circleId)
    .maybeSingle();
  if (!circle) return { exists: false, isMember: false, isAdmin: false, isOwner: false };
  const isOwner = Number(circle.owner_id) === Number(userid);
  const { data: mem } = await sb
    .from('circle_members')
    .select('role_id, circle_roles(name, can_manage_members, can_manage_channels, can_announce, can_manage_events, can_manage_recruit, can_pin)')
    .eq('circle_id', circleId)
    .eq('user_id', userid)
    .maybeSingle();
  const isMember = !!mem || isOwner;
  const roleName = mem?.circle_roles?.name;
  const isAdmin = isOwner || roleName === ADMIN_ROLE_NAME;
  return { exists: true, isMember, isAdmin, isOwner, ownerId: Number(circle.owner_id) };
}

async function fetchProfilesMap(sb, ids) {
  const uniq = [...new Set(ids.map(Number).filter(Boolean))];
  if (uniq.length === 0) return {};
  const { data } = await sb.from('profiles').select('moodle_id, name, avatar, color').in('moodle_id', uniq);
  const out = {};
  (data || []).forEach(p => { out[p.moodle_id] = p; });
  return out;
}

export async function hydrateCircles(sb, circleIds, viewerId) {
  if (circleIds.length === 0) return [];
  const [
    circlesRes,
    rolesRes,
    membersRes,
    catsRes,
    chansRes,
    annsRes,
    evtsRes,
    rsvpsRes,
    recruitsRes,
    appsRes,
    feePlansRes,
    feePeriodsRes,
    feeAssignsRes,
  ] = await Promise.all([
    sb.from('circles').select('*').in('id', circleIds),
    sb.from('circle_roles').select('*').in('circle_id', circleIds),
    sb.from('circle_members').select('*').in('circle_id', circleIds),
    sb.from('circle_categories').select('*').in('circle_id', circleIds).order('sort_order'),
    sb.from('circle_channels').select('*').in('circle_id', circleIds).order('sort_order'),
    sb.from('circle_announcements').select('*').in('circle_id', circleIds).order('created_at', { ascending: false }),
    sb.from('circle_events').select('*').in('circle_id', circleIds).order('event_date'),
    sb.from('circle_event_rsvps').select('event_id, user_id, status'),
    sb.from('circle_recruits').select('*').in('circle_id', circleIds),
    sb.from('circle_join_applications').select('*').in('circle_id', circleIds),
    sb.from('circle_fee_plans').select('*').in('circle_id', circleIds),
    sb.from('circle_fiscal_periods').select('*').in('circle_id', circleIds),
    sb.from('circle_fee_assignments').select('*').in('circle_id', circleIds),
  ]);

  const allUserIds = [
    ...(membersRes.data || []).map(m => m.user_id),
    ...(circlesRes.data || []).map(c => c.owner_id),
    ...(annsRes.data || []).map(a => a.by_user_id).filter(Boolean),
    ...(appsRes.data || []).map(a => a.user_id),
    ...(feeAssignsRes.data || []).map(a => a.user_id),
  ];
  const profiles = await fetchProfilesMap(sb, allUserIds);

  const byCircle = (arr, key = 'circle_id') => {
    const m = new Map();
    (arr || []).forEach(r => {
      const k = r[key];
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(r);
    });
    return m;
  };

  const rolesByCircle = byCircle(rolesRes.data);
  const membersByCircle = byCircle(membersRes.data);
  const catsByCircle = byCircle(catsRes.data);
  const chansByCircle = byCircle(chansRes.data);
  const annsByCircle = byCircle(annsRes.data);
  const evtsByCircle = byCircle(evtsRes.data);
  const recruitsByCircle = byCircle(recruitsRes.data);
  const appsByCircle = byCircle(appsRes.data);
  const feePlansByCircle = byCircle(feePlansRes.data);
  const feePeriodsByCircle = byCircle(feePeriodsRes.data);
  const feeAssignsByCircle = byCircle(feeAssignsRes.data);

  const rsvpsByEvent = new Map();
  (rsvpsRes.data || []).forEach(r => {
    if (r.status !== 'going') return;
    if (!rsvpsByEvent.has(r.event_id)) rsvpsByEvent.set(r.event_id, []);
    rsvpsByEvent.get(r.event_id).push(r.user_id);
  });

  return (circlesRes.data || []).map(c => {
    const roles = rolesByCircle.get(c.id) || [];
    const adminRole = roles.find(r => r.name === ADMIN_ROLE_NAME);
    const members = (membersByCircle.get(c.id) || []).map(m => {
      const p = profiles[m.user_id] || { name: `User ${m.user_id}`, avatar: '?', color: '#888' };
      const isAdmin = (adminRole && m.role_id === adminRole.id) || Number(c.owner_id) === Number(m.user_id);
      return { id: Number(m.user_id), name: p.name, avatar: p.avatar, color: p.color, role: isAdmin ? 'admin' : 'member' };
    });
    if (!members.find(m => m.id === Number(c.owner_id))) {
      const p = profiles[c.owner_id] || { name: `User ${c.owner_id}`, avatar: '?', color: '#888' };
      members.unshift({ id: Number(c.owner_id), name: p.name, avatar: p.avatar, color: p.color, role: 'admin' });
    }

    const viewerMember = members.find(m => Number(m.id) === Number(viewerId));
    const role = viewerMember?.role || (Number(c.owner_id) === Number(viewerId) ? 'admin' : 'member');

    return {
      id: c.id,
      name: c.name,
      icon: c.icon || c.name?.[0] || '?',
      color: c.color || '#6375f0',
      banner: c.banner || null,
      desc: c.description || '',
      isPublic: c.is_public,
      allowInvite: c.allow_invite,
      joinMode: c.join_mode || 'open',
      tags: c.tags || [],
      ownerId: Number(c.owner_id),
      role,
      memberCount: members.length,
      members,
      categories: (catsByCircle.get(c.id) || []).map(x => ({ id: x.id, name: x.name })),
      channels: (chansByCircle.get(c.id) || []).map(x => ({
        id: x.id, name: x.name, type: x.type || 'text', categoryId: x.category_id || undefined,
      })),
      announcements: (annsByCircle.get(c.id) || []).map(a => ({
        id: a.id, text: a.text, by: a.by_name, ts: a.created_at, pinned: !!a.pinned,
      })),
      events: (evtsByCircle.get(c.id) || []).map(e => ({
        id: e.id, title: e.title, date: e.event_date, location: e.location || '', desc: e.description || '',
        going: rsvpsByEvent.get(e.id) || [],
      })),
      recruit: (recruitsByCircle.get(c.id) || []).map(r => ({
        id: r.id, title: r.title, desc: r.description || '', spots: r.spots, applied: r.applied,
        deadline: r.deadline, closed: !!r.closed,
      })),
      applications: (appsByCircle.get(c.id) || []).map(a => {
        const p = profiles[a.user_id] || { name: `User ${a.user_id}`, avatar: '?', color: '#888' };
        return {
          id: a.id, userId: Number(a.user_id), userName: p.name, userAvatar: p.avatar, userColor: p.color,
          message: a.message || '', status: a.status,
          rejectReason: a.reject_reason || '', reviewedBy: a.reviewed_by, reviewedAt: a.reviewed_at,
          ts: a.created_at,
        };
      }),
      feePlans: (feePlansByCircle.get(c.id) || []).map(p => ({
        id: p.id, name: p.name, amount: p.amount, cycle: p.cycle, desc: p.description || '',
        isDefault: !!p.is_default, isActive: !!p.is_active, createdAt: p.created_at,
      })),
      feePeriods: (feePeriodsByCircle.get(c.id) || []).map(p => ({
        id: p.id, name: p.name, type: p.period_type, startDate: p.start_date, endDate: p.end_date,
        isCurrent: !!p.is_current,
      })),
      feeAssignments: (feeAssignsByCircle.get(c.id) || []).map(a => ({
        id: a.id, memberId: Number(a.user_id), planId: a.plan_id, periodId: a.period_id,
        status: a.status, amount: a.amount, dueDate: a.due_date, paidAt: a.paid_at,
      })),
    };
  });
}

// ── Subdoc diff configs ──
const SUBDOCS = {
  channels: {
    table: 'circle_channels',
    toRow: (item, circleId, idx) => ({
      id: item.id || newId('ch'),
      circle_id: circleId,
      category_id: item.categoryId || null,
      name: item.name,
      type: item.type || 'text',
      sort_order: idx,
    }),
    eq: (a, b) => a.name === b.name && (a.category_id || null) === (b.category_id || null) && (a.sort_order ?? 0) === (b.sort_order ?? 0),
  },
  categories: {
    table: 'circle_categories',
    toRow: (item, circleId, idx) => ({
      id: item.id || newId('cat'),
      circle_id: circleId,
      name: item.name,
      sort_order: idx,
    }),
    eq: (a, b) => a.name === b.name && (a.sort_order ?? 0) === (b.sort_order ?? 0),
  },
  announcements: {
    table: 'circle_announcements',
    toRow: (item, circleId, _idx, ctx) => ({
      id: item.id || newId('ann'),
      circle_id: circleId,
      text: item.text,
      by_name: item.by || ctx.userName || 'Unknown',
      by_user_id: ctx.userid,
      pinned: !!item.pinned,
    }),
    eq: (a, b) => a.text === b.text && !!a.pinned === !!b.pinned,
  },
  events: {
    table: 'circle_events',
    toRow: (item, circleId) => ({
      id: item.id || newId('cev'),
      circle_id: circleId,
      title: item.title,
      description: item.desc || '',
      location: item.location || '',
      event_date: item.date instanceof Date ? item.date.toISOString() : item.date,
    }),
    eq: (a, b) => a.title === b.title && (a.description || '') === (b.description || '') && (a.location || '') === (b.location || '') &&
      new Date(a.event_date).getTime() === new Date(b.event_date).getTime(),
    after: async (sb, circleId, items) => {
      const eventIds = items.map(it => it.id).filter(Boolean);
      if (eventIds.length === 0) return;
      const { data: existing } = await sb.from('circle_event_rsvps').select('event_id, user_id').in('event_id', eventIds);
      const haveSet = new Set((existing || []).map(r => `${r.event_id}|${r.user_id}`));
      const wantSet = new Set();
      const inserts = [];
      items.forEach(it => {
        (it.going || []).forEach(uid => {
          const k = `${it.id}|${uid}`;
          wantSet.add(k);
          if (!haveSet.has(k)) inserts.push({ event_id: it.id, user_id: Number(uid), status: 'going' });
        });
      });
      if (inserts.length > 0) await sb.from('circle_event_rsvps').insert(inserts);
      const toDelete = [...haveSet].filter(k => !wantSet.has(k));
      for (const k of toDelete) {
        const [evId, uid] = k.split('|');
        await sb.from('circle_event_rsvps').delete().eq('event_id', evId).eq('user_id', uid);
      }
    },
  },
  recruit: {
    table: 'circle_recruits',
    toRow: (item, circleId) => ({
      id: item.id || newId('rec'),
      circle_id: circleId,
      title: item.title,
      description: item.desc || '',
      spots: item.spots ?? 1,
      applied: item.applied ?? 0,
      deadline: item.deadline instanceof Date ? item.deadline.toISOString() : item.deadline,
      closed: !!item.closed,
    }),
    eq: (a, b) => a.title === b.title && (a.description || '') === (b.description || '') &&
      a.spots === b.spots && a.applied === b.applied && !!a.closed === !!b.closed &&
      String(a.deadline || '') === String(b.deadline || ''),
  },
  applications: {
    table: 'circle_join_applications',
    toRow: (item, circleId, _idx, ctx) => ({
      id: item.id || newId('app'),
      circle_id: circleId,
      user_id: Number(item.userId),
      message: item.message || '',
      status: item.status || 'pending',
      reject_reason: item.rejectReason || null,
      reviewed_by: item.reviewedBy ?? null,
      reviewed_at: item.reviewedAt || (item.status && item.status !== 'pending' ? new Date().toISOString() : null),
    }),
    eq: (a, b) => a.status === b.status && (a.reject_reason || '') === (b.reject_reason || ''),
  },
  feePlans: {
    table: 'circle_fee_plans',
    toRow: (item, circleId) => ({
      id: item.id || newId('fp'),
      circle_id: circleId,
      name: item.name,
      amount: item.amount ?? 0,
      cycle: item.cycle || 'yearly',
      description: item.desc || '',
      is_default: !!item.isDefault,
      is_active: item.isActive !== false,
    }),
    eq: (a, b) => a.name === b.name && a.amount === b.amount && a.cycle === b.cycle &&
      (a.description || '') === (b.description || '') && !!a.is_default === !!b.is_default && !!a.is_active === !!b.is_active,
  },
  feePeriods: {
    table: 'circle_fiscal_periods',
    toRow: (item, circleId) => ({
      id: item.id || newId('per'),
      circle_id: circleId,
      name: item.name,
      period_type: item.type || 'yearly',
      start_date: item.startDate,
      end_date: item.endDate,
      is_current: !!item.isCurrent,
    }),
    eq: (a, b) => a.name === b.name && a.period_type === b.period_type && a.start_date === b.start_date &&
      a.end_date === b.end_date && !!a.is_current === !!b.is_current,
  },
  feeAssignments: {
    table: 'circle_fee_assignments',
    toRow: (item, circleId) => ({
      id: item.id || newId('fa'),
      circle_id: circleId,
      user_id: Number(item.memberId),
      plan_id: item.planId,
      period_id: item.periodId,
      amount: item.amount ?? 0,
      status: item.status || 'unpaid',
      due_date: item.dueDate || null,
      paid_at: item.paidAt || null,
    }),
    eq: (a, b) => a.status === b.status && a.amount === b.amount &&
      String(a.due_date || '') === String(b.due_date || '') && String(a.paid_at || '') === String(b.paid_at || ''),
  },
};

async function diffSubdoc(sb, circleId, key, newItems, ctx) {
  const cfg = SUBDOCS[key];
  if (!cfg) return;
  const { data: existing } = await sb.from(cfg.table).select('*').eq('circle_id', circleId);
  const exMap = new Map((existing || []).map(r => [r.id, r]));
  const items = newItems || [];
  const wantRows = items.map((it, idx) => cfg.toRow(it, circleId, idx, ctx));
  const wantIds = new Set(wantRows.map(r => r.id));

  const toInsert = [];
  const toUpdate = [];
  for (const row of wantRows) {
    const prev = exMap.get(row.id);
    if (!prev) toInsert.push(row);
    else if (!cfg.eq(row, prev)) toUpdate.push(row);
  }
  const toDelete = [...exMap.keys()].filter(id => !wantIds.has(id));

  if (toInsert.length > 0) {
    const { error } = await sb.from(cfg.table).insert(toInsert);
    if (error) throw error;
  }
  for (const row of toUpdate) {
    const { id, ...rest } = row;
    const { error } = await sb.from(cfg.table).update(rest).eq('id', id);
    if (error) throw error;
  }
  if (toDelete.length > 0) {
    const { error } = await sb.from(cfg.table).delete().in('id', toDelete);
    if (error) throw error;
  }
  if (cfg.after) await cfg.after(sb, circleId, items);
}

async function applyMembersDiff(sb, circleId, newMembers, ownerId) {
  const adminRoleId = await ensureAdminRole(sb, circleId);
  const { data: existing } = await sb.from('circle_members').select('user_id, role_id').eq('circle_id', circleId);
  const exMap = new Map((existing || []).map(r => [Number(r.user_id), r]));
  const want = (newMembers || []).filter(m => Number(m.id) !== Number(ownerId));
  const wantIds = new Set(want.map(m => Number(m.id)));

  for (const m of want) {
    const uid = Number(m.id);
    const desiredRoleId = m.role === 'admin' ? adminRoleId : null;
    const prev = exMap.get(uid);
    if (!prev) {
      await sb.from('circle_members').insert({ circle_id: circleId, user_id: uid, role_id: desiredRoleId });
    } else if ((prev.role_id || null) !== (desiredRoleId || null)) {
      await sb.from('circle_members').update({ role_id: desiredRoleId }).eq('circle_id', circleId).eq('user_id', uid);
    }
  }
  const toDelete = [...exMap.keys()].filter(uid => !wantIds.has(uid) && uid !== Number(ownerId));
  if (toDelete.length > 0) {
    await sb.from('circle_members').delete().eq('circle_id', circleId).in('user_id', toDelete);
  }
}

const FIELD_MAP = {
  name: 'name',
  icon: 'icon',
  color: 'color',
  banner: 'banner',
  desc: 'description',
  description: 'description',
  isPublic: 'is_public',
  allowInvite: 'allow_invite',
  joinMode: 'join_mode',
  tags: 'tags',
};

export async function applyCirclePatch(sb, circleId, patch, ctx) {
  const directUpdate = {};
  for (const [k, v] of Object.entries(patch || {})) {
    if (FIELD_MAP[k]) directUpdate[FIELD_MAP[k]] = v;
  }
  if (Object.keys(directUpdate).length > 0) {
    const { error } = await sb.from('circles').update(directUpdate).eq('id', circleId);
    if (error) throw error;
  }

  if (patch.members) {
    const { data: c } = await sb.from('circles').select('owner_id').eq('id', circleId).single();
    await applyMembersDiff(sb, circleId, patch.members, c.owner_id);
  }
  for (const key of Object.keys(SUBDOCS)) {
    if (patch[key] !== undefined) {
      await diffSubdoc(sb, circleId, key, patch[key], ctx);
    }
  }
}
