import { cookies } from 'next/headers';
import { AUTH_COOKIE_NAME, createPasswordHash, getSessionFromToken } from '@/lib/auth';
import { isSameOriginRequest, privateJson } from '@/lib/http';
import { createSupabaseAdminClient, isSupabaseAdminConfigured } from '@/lib/supabase-admin';
import type { AccountRole } from '@/types';

type AccountAction = 'create' | 'update' | 'delete';

type AccountRequest = {
  action?: AccountAction;
  id?: string;
  username?: string;
  password?: string;
  role?: AccountRole;
  displayName?: string;
  company?: string;
  active?: boolean;
};

async function requireAdmin() {
  const cookieStore = await cookies();
  const session = await getSessionFromToken(cookieStore.get(AUTH_COOKIE_NAME)?.value);
  return session?.role === 'admin' ? session : null;
}

function cleanUsername(username: unknown) {
  return typeof username === 'string' ? username.trim().toLowerCase() : '';
}

function cleanText(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function cleanRole(value: unknown): AccountRole {
  return value === 'admin' ? 'admin' : 'viewer';
}

function publicAccount(account: Record<string, unknown>) {
  return {
    id: account.id,
    username: account.username,
    role: account.role,
    display_name: account.display_name,
    company: account.company,
    active: account.active,
    created_at: account.created_at,
    updated_at: account.updated_at,
    last_login_at: account.last_login_at,
  };
}

async function wouldRemoveLastActiveAdmin(
  accountId: string,
  nextRole: AccountRole,
  nextActive: boolean
) {
  const supabase = createSupabaseAdminClient();
  const { data: target, error: targetError } = await supabase
    .from('app_accounts')
    .select('id, role, active')
    .eq('id', accountId)
    .maybeSingle();
  if (targetError) throw targetError;
  if (!target || target.role !== 'admin' || !target.active) return false;
  if (nextRole === 'admin' && nextActive) return false;

  const { count, error: countError } = await supabase
    .from('app_accounts')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'admin')
    .eq('active', true)
    .neq('id', accountId);
  if (countError) throw countError;
  return (count || 0) === 0;
}

export async function GET() {
  if (!(await requireAdmin())) {
    return privateJson({ ok: false, message: 'Admin access required.' }, { status: 403 });
  }

  if (!isSupabaseAdminConfigured()) {
    return privateJson({ ok: false, message: 'Supabase is not configured.' }, { status: 500 });
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from('app_accounts')
    .select('id, username, role, display_name, company, active, created_at, updated_at, last_login_at')
    .order('created_at', { ascending: false });

  if (error) {
    console.error(error);
    return privateJson({ ok: false, message: 'Could not load accounts.' }, { status: 500 });
  }

  return privateJson({ ok: true, data: data || [] });
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return privateJson({ ok: false, message: 'Cross-origin request blocked.' }, { status: 403 });
  }

  const session = await requireAdmin();
  if (!session) {
    return privateJson({ ok: false, message: 'Admin access required.' }, { status: 403 });
  }

  if (!isSupabaseAdminConfigured()) {
    return privateJson({ ok: false, message: 'Supabase is not configured.' }, { status: 500 });
  }

  const body = await request.json().catch(() => null) as AccountRequest | null;
  if (!body?.action) {
    return privateJson({ ok: false, message: 'Missing account action.' }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();

  if (body.action === 'create') {
    const username = cleanUsername(body.username);
    const password = typeof body.password === 'string' ? body.password : '';

    if (!username || password.length < 8) {
      return privateJson({ ok: false, message: 'Username and an 8+ character password are required.' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('app_accounts')
      .insert({
        username,
        password_hash: await createPasswordHash(password),
        role: cleanRole(body.role),
        display_name: cleanText(body.displayName),
        company: cleanText(body.company),
        active: body.active !== false,
      })
      .select('id, username, role, display_name, company, active, created_at, updated_at, last_login_at')
      .single();

    if (error) {
      console.error(error);
      return privateJson({ ok: false, message: 'Could not create account. Username may already exist.' }, { status: 500 });
    }

    return privateJson({ ok: true, data: publicAccount(data) });
  }

  if (!body.id) {
    return privateJson({ ok: false, message: 'Account id is required.' }, { status: 400 });
  }

  if (body.action === 'update') {
    const nextRole = cleanRole(body.role);
    const nextActive = body.active !== false;
    if (await wouldRemoveLastActiveAdmin(body.id, nextRole, nextActive)) {
      return privateJson({ ok: false, message: 'At least one active administrator must remain.' }, { status: 409 });
    }

    const updates: Record<string, unknown> = {
      role: nextRole,
      display_name: cleanText(body.displayName),
      company: cleanText(body.company),
      active: nextActive,
    };

    if (typeof body.password === 'string' && body.password) {
      if (body.password.length < 8) {
        return privateJson({ ok: false, message: 'Password must be at least 8 characters.' }, { status: 400 });
      }
      updates.password_hash = await createPasswordHash(body.password);
    }

    const { data, error } = await supabase
      .from('app_accounts')
      .update(updates)
      .eq('id', body.id)
      .select('id, username, role, display_name, company, active, created_at, updated_at, last_login_at')
      .single();

    if (error) {
      console.error(error);
      return privateJson({ ok: false, message: 'Could not update account.' }, { status: 500 });
    }

    return privateJson({ ok: true, data: publicAccount(data) });
  }

  if (body.action === 'delete') {
    if (session.accountId === body.id) {
      return privateJson({ ok: false, message: 'You cannot delete your current account.' }, { status: 400 });
    }
    if (await wouldRemoveLastActiveAdmin(body.id, 'viewer', false)) {
      return privateJson({ ok: false, message: 'At least one active administrator must remain.' }, { status: 409 });
    }

    const { error } = await supabase.from('app_accounts').delete().eq('id', body.id);
    if (error) {
      console.error(error);
      return privateJson({ ok: false, message: 'Could not delete account.' }, { status: 500 });
    }

    return privateJson({ ok: true });
  }

  return privateJson({ ok: false, message: 'Unsupported account action.' }, { status: 400 });
}
