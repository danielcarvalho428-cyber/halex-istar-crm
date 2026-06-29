import { createSupabaseAdminClient, isSupabaseAdminConfigured } from '@/lib/supabase-admin';
import { privateJson } from '@/lib/http';

export async function GET() {
  const startedAt = Date.now();
  if (!isSupabaseAdminConfigured()) {
    return privateJson({ ok: false, status: 'degraded', database: 'not_configured' }, { status: 503 });
  }

  try {
    const supabase = createSupabaseAdminClient();
    const { count, error } = await supabase
      .from('licitacoes')
      .select('id', { count: 'exact', head: true });
    if (error) throw error;

    return privateJson({
      ok: true,
      status: 'healthy',
      database: 'connected',
      tenders: count || 0,
      latencyMs: Date.now() - startedAt,
      checkedAt: new Date().toISOString(),
    });
  } catch {
    return privateJson({
      ok: false,
      status: 'degraded',
      database: 'unavailable',
      latencyMs: Date.now() - startedAt,
      checkedAt: new Date().toISOString(),
    }, { status: 503 });
  }
}
