import { supabase, isSupabaseConfigured } from '../backend/supabase';

// 캐시를 저장할 Map 객체 (key: userId, value: { isAdmin, expiresAt })
const adminCache = new Map<string, { isAdmin: boolean; expiresAt: number }>();
const CACHE_TTL_MS = 1000 * 60 * 5; // 5분 캐시
export const isPresetAdmin = async (userId: string): Promise<boolean> => {
  if (!isSupabaseConfigured) return false;

  const now = Date.now();
  const cached = adminCache.get(userId);
  // 캐시가 존재하고 아직 만료되지 않았다면 DB 조회 없이 반환
  if (cached && cached.expiresAt > now) {
    return cached.isAdmin;
  }

  try {
    const { data, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .single();
    if (error && error.code !== 'PGRST116') {
      console.error('[Discord Bot] Failed to check admin role:', error.message);
    }
    const isAdmin = data?.role === 'admin';
    // DB 조회 결과를 캐시에 저장 (5분간 유지)
    adminCache.set(userId, { isAdmin, expiresAt: now + CACHE_TTL_MS });
    return isAdmin;
  } catch (err) {
    console.error('[Discord Bot] Exception in isPresetAdmin:', err);
    return false;
  }
};
