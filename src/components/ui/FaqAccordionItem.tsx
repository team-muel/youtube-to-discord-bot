import React from 'react';
import { ChevronDown } from 'lucide-react';
import { SurfaceCard } from './SurfaceCard';

interface FaqAccordionItemProps {
  question: string;
  answer: string;
  isOpen: boolean;
  index: number;
  onToggle: () => void;
}

export const FaqAccordionItem: React.FC<FaqAccordionItemProps> = ({
  question,
  answer,
  isOpen,
  index,
  onToggle,
}) => {
  const faqAnswerId = `faq-answer-${index}`;
  const faqButtonId = `faq-button-${index}`;

  return (
    <SurfaceCard className="faq-item-shell">
      <button
        id={faqButtonId}
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={faqAnswerId}
        className={`faq-item-button ${isOpen ? 'is-open' : ''}`.trim()}
      >
        <span className="faq-item-question">{question}</span>
        <ChevronDown className={`faq-item-icon ${isOpen ? 'is-open' : ''}`.trim()} />
      </button>
      {isOpen && (
        <div id={faqAnswerId} role="region" aria-labelledby={faqButtonId} className="faq-item-answer">
          {answer}
        </div>
      )}
    </SurfaceCard>
  );
};
