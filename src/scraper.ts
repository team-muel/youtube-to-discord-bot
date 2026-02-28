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
export async function scrapeYouTubePost(url: string) {
  // 1) API 키가 설정되어 있고 URL이 채널/게시물 형태라면 공식 API 사용을 시도
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (apiKey) {
    console.debug('[scraper] YOUTUBE_API_KEY detected, attempting API call');
    try {
      const channelMatch = url.match(/channel\/([A-Za-z0-9_-]+)/);
      console.debug('[scraper] channelMatch:', channelMatch);
      if (channelMatch) {
        const channelId = channelMatch[1];
        const apiUrl = `https://www.googleapis.com/youtube/v3/activities?part=snippet&channelId=${channelId}&key=${apiKey}&maxResults=1`;
        console.debug('[scraper] calling YT API:', apiUrl);
        const apiRes = await fetch(apiUrl);
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
  const tryRss = async (url: string) => {
    const channelMatch = url.match(/channel\/([A-Za-z0-9_-]+)/);
    if (!channelMatch) return null;
    const channelId = channelMatch[1];
    const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
    try {
      const rssRes = await fetch(rssUrl);
      if (!rssRes.ok) return null;
      const text = await rssRes.text();
      // 간단한 XML 파싱 (정규식 기반. 구조가 바뀌면 실패할 수 있음)
      const titleMatch = text.match(/<title>([^<]+)<\/title>/);
      const thumbnailMatch = text.match(/<media:thumbnail[^>]+url="([^"]+)"/);
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

  // 3) HTML 스크래핑 영역

  try {
    // 유튜브 페이지 HTML 가져오기 (봇 차단을 막기 위해 User-Agent 설정)
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
      }
    });
    
    const html = await res.text();
    
    // 유튜브는 초기 데이터를 ytInitialData라는 JSON 변수에 담아둡니다. 이를 정규식으로 추출합니다.
    const match = html.match(/var ytInitialData = (\{.*?\});<\/script>/);
    if (!match) throw new Error('유튜브 데이터를 찾을 수 없습니다.');
    
    const data = JSON.parse(match[1]);
    
    // JSON 트리에서 게시글 데이터(backstagePostRenderer)를 깊이 우선 탐색으로 찾습니다.
    let postRenderer: Record<string, any> | null = null;
    const search = (obj: any) => {
      if (postRenderer) return;
      if (!obj || typeof obj !== 'object') return;
      if (obj.backstagePostRenderer) {
        postRenderer = obj.backstagePostRenderer;
        return;
      }
      if (obj.sharedPostRenderer) {
        postRenderer = obj.sharedPostRenderer;
        return;
      }
      for (const key in obj) {
        search(obj[key]);
      }
    };
    search(data);

    if (!postRenderer) throw new Error('게시글 내용을 찾을 수 없습니다.');

    // 1. 텍스트 추출
    let content = '';
    if (postRenderer.contentText && postRenderer.contentText.runs) {
      content = postRenderer.contentText.runs.map((r: { text: string }) => r.text).join('');
    }

    // 2. 이미지 추출 (가장 해상도가 높은 마지막 썸네일 사용)
    let imageUrl = '';
    if (postRenderer.backstageAttachment && postRenderer.backstageAttachment.backstageImageRenderer) {
      const thumbnails = postRenderer.backstageAttachment.backstageImageRenderer.image.thumbnails;
      if (thumbnails && thumbnails.length > 0) {
        imageUrl = thumbnails[thumbnails.length - 1].url;
      }
    } else if (postRenderer.backstageAttachment && postRenderer.backstageAttachment.postMultiImageRenderer) {
      // 이미지가 여러 장인 경우 첫 번째 이미지 추출
      const images = postRenderer.backstageAttachment.postMultiImageRenderer.images;
      if (images && images.length > 0) {
        const thumbnails = images[0].backstageImageRenderer.image.thumbnails;
        imageUrl = thumbnails[thumbnails.length - 1].url;
      }
    }

    // 3. 작성자(채널명) 추출
    let author = '유튜브 채널';
    if (postRenderer.authorText && postRenderer.authorText.runs) {
      author = postRenderer.authorText.runs.map((r: { text: string }) => r.text).join('');
    }

    return { content, imageUrl, author };
  } catch (error: unknown) {
    console.error('Scraping error:', error);
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`크롤링 실패: ${msg}`);
  }
}
