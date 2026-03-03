
import { createApp } from './src/app';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const app = createApp();

// 라우터 등록 및 미들웨어 조립은 createApp 내부 또는 별도 파일에서 수행

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[RENDER_EVENT] SERVER_READY port=${PORT}`);
  console.log(`Server running on http://localhost:${PORT}`);
});
