import { createClient } from '@supabase/supabase-js';

let adminClient: ReturnType<typeof createClient> | null = null;

export function createSupabaseAdminClient() {
  if (!adminClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SECRET_KEY;

    if (!url || !serviceKey) {
      throw new Error('Supabase admin credentials are not configured');
    }

    adminClient = createClient(url, serviceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  return adminClient;
}

export const CLIENT_DOCUMENTS_BUCKET =
  process.env.SUPABASE_CLIENT_DOCUMENTS_BUCKET ?? 'client-documents';
