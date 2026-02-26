import { scrapeYouTubePost } from './src/scraper.js';

async function test() {
  try {
    const url = 'http://youtube.com/post/Ugkxr4ry97bvKkhD8_GmIvR7Oj7swnPq3Ca4?si=YPpWh7ZBLpSgkO-l';
    const result = await scrapeYouTubePost(url);
    console.log('Scrape Result:', result);
    
    const maxContentLength = 1900;
    let truncatedContent = result.content || '내용 없음';
    if (truncatedContent.length > maxContentLength) {
      truncatedContent = truncatedContent.substring(0, maxContentLength) + '...\n(내용이 너무 길어 생략되었습니다)';
    }
    const fullContent = `${truncatedContent}\n\n🔗 원본 링크: ${url}`;
    console.log('Full Content Length:', fullContent.length);
    console.log('Full Content:', fullContent);
  } catch (err) {
    console.error(err);
  }
}

test();
