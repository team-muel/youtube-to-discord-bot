// Utility helpers shared across server code

/**
 * Validate if URL is a valid YouTube URL
 * Returns { valid: boolean, message?: string }
 * 
 * Examples:
 * - youtube.com/watch?v=dQw4w9WgXcQ ✅
 * - youtu.be/dQw4w9WgXcQ ✅
 * - youtube.com/post/POSTID ✅
 * - youtube.com/@channelname ✅
 * - youtube.com/channel/CHANNELID ✅
 * - google.com/search?q=youtube ❌
 */
export function validateYouTubeUrl(url: string): { valid: boolean; message?: string } {
  try {
    // Try to parse as URL
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    
    // Check if it's a YouTube domain
    const youtubeHosts = [
      'youtube.com',
      'www.youtube.com',
      'youtu.be',
      'youtube-nocookie.com',
      'www.youtube-nocookie.com'
    ];
    
    const isYoutubeDomain = youtubeHosts.includes(hostname);
    if (!isYoutubeDomain) {
      return { 
        valid: false, 
        message: '유효한 YouTube URL이 아닙니다.' 
      };
    }
    
    // Check if URL has some path/query (not just bare youtube.com)
    const hasContent = urlObj.pathname !== '/' || urlObj.search !== '';
    if (!hasContent) {
      return { 
        valid: false, 
        message: 'YouTube URL에 채널이나 동영상 정보가 포함되어야 합니다.' 
      };
    }
    
    return { valid: true };
  } catch (error) {
    return { 
      valid: false, 
      message: '올바른 URL 형식이 아닙니다.' 
    };
  }
}

/**
 * Download an image URL and return a data URI string (base64) or undefined if failed
 */
export async function imageUrlToBase64(imageUrl: string): Promise<string | undefined> {
  try {
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) return undefined;
    const arrayBuffer = await imgRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
    return `data:${contentType};base64,${buffer.toString('base64')}`;
  } catch (e) {
    console.warn('[utils] imageUrlToBase64 failed', e);
    return undefined;
  }
}

/**
 * Truncate text to the given maximum length, appending ellipsis and note if clipped.
 */
export function truncateText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.substring(0, maxLen) + '...\n(내용이 너무 길어 생략되었습니다)';
}

/**
 * Convert error to safe client message:
 * - Hides sensitive database/API details
 * - Logs full error server-side for debugging
 */
export function getSafeErrorMessage(error: unknown, context: string): string {
  const fullMsg = error instanceof Error ? error.message : String(error);
  
  // Log full error server-side (not sent to client)
  console.error(`[${context}] Error detail:`, fullMsg);
  
  // Sanitize common error patterns
  const lowerMsg = fullMsg.toLowerCase();
  
  // Database errors
  if (lowerMsg.includes('supabase') || lowerMsg.includes('postgres') || lowerMsg.includes('database')) {
    return '데이터 작업 중 오류가 발생했습니다.';
  }
  
  // Network/fetch errors
  if (lowerMsg.includes('fetch') || lowerMsg.includes('network') || lowerMsg.includes('timeout')) {
    return '외부 서비스 연결 중 오류가 발생했습니다.';
  }
  
  // Discord API errors
  if (lowerMsg.includes('discord') || lowerMsg.includes('token')) {
    return 'Discord 연동 중 오류가 발생했습니다.';
  }
  
  // YouTube/scraper errors
  if (lowerMsg.includes('youtube') || lowerMsg.includes('scrape')) {
    return 'YouTube 정보를 가져올 수 없습니다. URL을 확인하세요.';
  }
  
  // Default generic message
  return '작업 처리 중 오류가 발생했습니다.';
}

/**
 * Maximum number of sources a user can register per guild (configurable via constant)
 */
export const MAX_SOURCES_PER_GUILD = 4;

/**
 * Default pagination limit for API responses
 */
export const DEFAULT_PAGE_LIMIT = 10;
export const MAX_LOGS_DISPLAY = 50;

