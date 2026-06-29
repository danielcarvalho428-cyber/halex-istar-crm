import { cookies } from 'next/headers';
import { AUTH_COOKIE_NAME, getSessionFromToken } from '@/lib/auth';
import { privateJson } from '@/lib/http';
import { createSupabaseAdminClient, isSupabaseAdminConfigured } from '@/lib/supabase-admin';

export async function GET() {
  const cookieStore = await cookies();
  const session = await getSessionFromToken(cookieStore.get(AUTH_COOKIE_NAME)?.value);
  if (!session) return privateJson({ ok: false, message: 'Unauthorized.' }, { status: 401 });
  if (!isSupabaseAdminConfigured()) return privateJson({ ok: false, message: 'Database unavailable.' }, { status: 503 });

  const supabase = createSupabaseAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const [tasks, audits, latestTender, latestOpportunity] = await Promise.all([
    supabase
      .from('commercial_tasks')
      .select('*')
      .eq('status', 'pendente')
      .order('due_at', { ascending: true })
      .limit(20),
    supabase
      .from('audit_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50),
    supabase.from('licitacoes').select('updated_at').order('updated_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('commercial_opportunities').select('updated_at').order('updated_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  for (const result of [tasks, audits, latestTender, latestOpportunity]) {
    if (result.error) return privateJson({ ok: false, message: result.error.message }, { status: 500 });
  }

  const pendingTasks = tasks.data || [];
  const overdue = pendingTasks.filter((task) => task.due_at < today).length;
  const dueToday = pendingTasks.filter((task) => task.due_at === today).length;
  const latestUpdate = [latestTender.data?.updated_at, latestOpportunity.data?.updated_at]
    .filter(Boolean)
    .sort()
    .at(-1) || null;

  return privateJson({
    ok: true,
    data: {
      pendingTasks,
      audits: audits.data || [],
      overdue,
      dueToday,
      notificationCount: overdue + dueToday,
      latestUpdate,
    },
  });
}
