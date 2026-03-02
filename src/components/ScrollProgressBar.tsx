import React from 'react';

interface ScrollProgressBarProps {
  progress: number;
}

export const ScrollProgressBar: React.FC<ScrollProgressBarProps> = ({ progress }) => {
  return (
    <div className="scroll-progress-shell">
      <div className="scroll-progress-fill" style={{ width: `${progress}%` }} />
    </div>
  );
};
