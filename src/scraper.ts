/**
 * 크롤러 주의사항
 * ----------------
 * 유튜브 커뮤니티 게시물은 공식 공개 API가 없고 HTML 구조도 자주 바뀝니다.
 * 따라서 현재 구현은 `ytInitialData`를 정규식으로 파싱하는 매우 취약한 방식입니다.
 *
 * 개선 방안:
 * 1. 가능하다면 YouTube Data API나 RSS 피드를 사용하고, `YOUTUBE_API_KEY` 환경변수를
 *    통해 키를 설정하여 이 함수에서 우선적으로 API 호출을 시도하도록 합니다.
 * 2. HTML 스크래핑은 구조 변경 시 쉽게 깨지므로 try/catch로 래핑하고
 *    오류 메시지에 수정 방법을 안내합니다.
 * 3. 더 나아가 서버 측에서 Cloud Pub/Sub 혹은 써드파티 크롤러를 사용하는 것도 고려.
 */
import type { ScrapedYouTubePost } from './types';

const YOUTUBE_FETCH_TIMEOUT_MS = Number(process.env.YOUTUBE_FETCH_TIMEOUT_MS || 12000);
const YOUTUBE_HTML_MAX_BYTES = Number(process.env.YOUTUBE_HTML_MAX_BYTES || 5_000_000);

const fetchWithTimeout = async (input: string, init?: RequestInit, timeoutMs = YOUTUBE_FETCH_TIMEOUT_MS) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(3000, timeoutMs));
  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
};

const extractChannelId = (url: string): string | null => {
  const direct = url.match(/channel\/([A-Za-z0-9_-]+)/);
  if (direct?.[1]) {
    return direct[1];
  }

  try {
    const parsed = new URL(url);
    const queryChannelId = parsed.searchParams.get('channel_id');
    if (queryChannelId) {
      return queryChannelId;
    }
  } catch {
    // ignore URL parse error
  }

  return null;
};

const extractJsonObjectByBraceMatch = (text: string, startIndex: number): string | null => {
  const firstBrace = text.indexOf('{', startIndex);
  if (firstBrace < 0) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = firstBrace; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') {
      depth += 1;
      continue;
    }

    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return text.slice(firstBrace, index + 1);
      }
    }
  }

  return null;
};

const extractYtInitialData = (html: string): Record<string, unknown> | null => {
  const markers = [
    'var ytInitialData =',
    'window["ytInitialData"] =',
    'window[\'ytInitialData\'] =',
    'ytInitialData =',
  ];

  for (const marker of markers) {
    const markerIndex = html.indexOf(marker);
    if (markerIndex < 0) {
      continue;
    }

    const jsonText = extractJsonObjectByBraceMatch(html, markerIndex + marker.length);
    if (!jsonText) {
      continue;
    }

    try {
      const parsed = JSON.parse(jsonText);
      if (parsed && typeof parsed === 'object') {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // try next marker
    }
  }

  return null;
};

export async function scrapeYouTubePost(url: string): Promise<ScrapedYouTubePost> {
  // 1) API 키가 설정되어 있고 URL이 채널/게시물 형태라면 공식 API 사용을 시도
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (apiKey) {
    console.debug('[scraper] YOUTUBE_API_KEY detected, attempting API call');
    try {
      const channelId = extractChannelId(url);
      console.debug('[scraper] channelId:', channelId);
      if (channelId) {
        const apiUrl = `https://www.googleapis.com/youtube/v3/activities?part=snippet&channelId=${channelId}&key=${apiKey}&maxResults=1`;
        console.debug('[scraper] calling YT API:', apiUrl);
        const apiRes = await fetchWithTimeout(apiUrl);
        console.debug('[scraper] API response status', apiRes.status);
        if (apiRes.ok) {
          const json = await apiRes.json();
          const item = json.items && json.items[0];
          console.debug('[scraper] API item', item);
          if (item && item.snippet) {
            return {
              content: item.snippet.title || '',
              imageUrl: item.snippet.thumbnails?.high?.url || '',
              author: item.snippet.channelTitle || '유튜브 채널'
            };
          }
        }
      }
    } catch (e) {
      console.warn('API 기반 크롤링에 실패, HTML 스크래핑으로 폴백합니다.', e);
    }
  }

  // 2) RSS 피드 시도 (채널 ID가 있으면)
  const tryRss = async (url: string): Promise<ScrapedYouTubePost | null> => {
    const channelId = extractChannelId(url);
    if (!channelId) return null;
    const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
    try {
      const rssRes = await fetchWithTimeout(rssUrl);
      if (!rssRes.ok) return null;
      const text = await rssRes.text();
      // 간단한 XML 파싱 (정규식 기반. 구조가 바뀌면 실패할 수 있음)
      const firstEntry = text.match(/<entry>[\s\S]*?<\/entry>/);
      if (!firstEntry) return null;
      const titleMatch = firstEntry[0].match(/<title>([^<]+)<\/title>/);
      const thumbnailMatch = firstEntry[0].match(/<media:thumbnail[^>]+url="([^"]+)"/);
      const authorMatch = text.match(/<author>\s*<name>([^<]+)<\/name>/);
      return {
        content: titleMatch?.[1] || '',
        imageUrl: thumbnailMatch?.[1] || '',
        author: authorMatch?.[1] || '유튜브 채널'
      };
    } catch (e) {
      console.warn('[scraper] RSS fetch failed, ignoring', e);
      return null;
    }
  };

  const rssResult = await tryRss(url);
  if (rssResult && (rssResult.content || rssResult.imageUrl)) {
    return rssResult;
  }

  // 3) HTML 스크래핑 영역

  try {
    // 유튜브 페이지 HTML 가져오기 (봇 차단을 막기 위해 User-Agent 설정)
    const res = await fetchWithTimeout(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
      }
    });

    if (!res.ok) {
      throw new Error(`유튜브 페이지 응답 오류: HTTP ${res.status}`);
    }
    
    const html = await res.text();
    if (html.length > YOUTUBE_HTML_MAX_BYTES) {
      throw new Error(`유튜브 페이지가 너무 큽니다. (${html.length} bytes)`);
    }
    
    // 유튜브는 초기 데이터를 ytInitialData라는 JSON 변수에 담아둡니다.
    const data = extractYtInitialData(html);
    if (!data) throw new Error('유튜브 초기 데이터를 찾을 수 없습니다.');
    
    // JSON 트리에서 게시글 데이터(backstagePostRenderer)를 깊이 우선 탐색으로 찾습니다.
    let postRenderer: Record<string, unknown> | null = null;
    const search = (obj: unknown) => {
      if (postRenderer) return;
      if (!obj || typeof obj !== 'object') return;
      const record = obj as Record<string, unknown>;
      if (record.backstagePostRenderer && typeof record.backstagePostRenderer === 'object') {
        postRenderer = record.backstagePostRenderer as Record<string, unknown>;
        return;
      }
      if (record.sharedPostRenderer && typeof record.sharedPostRenderer === 'object') {
        postRenderer = record.sharedPostRenderer as Record<string, unknown>;
        return;
      }
      Object.values(record).forEach((value) => {
        search(value);
      });
    };
    search(data);

    if (!postRenderer) throw new Error('게시글 내용을 찾을 수 없습니다.');

    const getRunsText = (value: unknown) => {
      if (!value || typeof value !== 'object') return '';
      const runs = (value as { runs?: Array<{ text?: string }> }).runs;
      if (!Array.isArray(runs)) return '';
      return runs.map((item) => item?.text || '').join('');
    };

    const getNested = (source: unknown, path: string[]): unknown => {
      return path.reduce<unknown>((acc, key) => {
        if (!acc || typeof acc !== 'object') return undefined;
        return (acc as Record<string, unknown>)[key];
      }, source);
    };

    // 1. 텍스트 추출
    const content = getRunsText(getNested(postRenderer, ['contentText']));

    // 2. 이미지 추출 (가장 해상도가 높은 마지막 썸네일 사용)
    let imageUrl = '';
    const singleThumbs = getNested(postRenderer, ['backstageAttachment', 'backstageImageRenderer', 'image', 'thumbnails']);
    if (Array.isArray(singleThumbs) && singleThumbs.length > 0) {
      const last = singleThumbs[singleThumbs.length - 1] as { url?: string };
      imageUrl = last?.url || '';
    } else {
      const multiImages = getNested(postRenderer, ['backstageAttachment', 'postMultiImageRenderer', 'images']);
      if (Array.isArray(multiImages) && multiImages.length > 0) {
        const thumbnails = getNested(multiImages[0], ['backstageImageRenderer', 'image', 'thumbnails']);
        if (Array.isArray(thumbnails) && thumbnails.length > 0) {
          const last = thumbnails[thumbnails.length - 1] as { url?: string };
          imageUrl = last?.url || '';
        }
      }
    };

    // 3. 작성자(채널명) 추출
    const author = getRunsText(getNested(postRenderer, ['authorText'])) || '유튜브 채널';

    return { content, imageUrl, author };
  } catch (error: unknown) {
    console.error('Scraping error:', error);
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`크롤링 실패: ${msg}`);
  }
}
