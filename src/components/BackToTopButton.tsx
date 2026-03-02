import React from 'react';
import { ArrowUp } from 'lucide-react';
import { commonText } from '../content/commonText';
import { UiButton } from './ui/UiButton';

export const BackToTopButton: React.FC = () => {
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    const onScroll = () => {
      setVisible(window.scrollY > 480);
    };

    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (!visible) {
    return null;
  }

  return (
    <UiButton
      variant="ghost"
      size="sm"
      ariaLabel={commonText.helper.backToTopAria}
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      className="back-to-top-btn"
    >
      <ArrowUp className="icon-16" />
      {commonText.helper.backToTop}
    </UiButton>
  );
};
