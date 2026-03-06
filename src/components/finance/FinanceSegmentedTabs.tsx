interface FinanceSegmentedTabsProps {
  items: readonly string[];
  activeIndex: number;
  ariaLabel: string;
  className?: string;
  onChange?: (index: number) => void;
}

export const FinanceSegmentedTabs = ({
  items,
  activeIndex,
  ariaLabel,
  className = '',
  onChange,
}: FinanceSegmentedTabsProps) => {
  return (
    <div className={className} role="tablist" aria-label={ariaLabel}>
      {items.map((item, index) => (
        <button
          key={item}
          type="button"
          role="tab"
          aria-selected={index === activeIndex}
          className={index === activeIndex ? 'is-active' : ''}
          onClick={() => onChange?.(index)}
        >
          {item}
        </button>
      ))}
    </div>
  );
};
