export async function scrapeYouTubePost(url: string) {
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
    let postRenderer: any = null;
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
      content = postRenderer.contentText.runs.map((r: any) => r.text).join('');
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
      author = postRenderer.authorText.runs.map((r: any) => r.text).join('');
    }

    return { content, imageUrl, author };
  } catch (error: any) {
    console.error('Scraping error:', error);
    throw new Error(`크롤링 실패: ${error.message}`);
  }
}
