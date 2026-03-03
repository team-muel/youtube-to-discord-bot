
import { useEffect } from 'react';
import * as DiscordSDK from '@discord/embedded-app-sdk';

export const EmbeddedApp = () => {
  useEffect(() => {
    DiscordSDK.ready();
    // DiscordSDK.getUser().then(console.log); // 예시: 유저 정보 가져오기
  }, []);
  return <ResearchPageLayout presetKey="embedded" />;
};



