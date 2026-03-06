import { createElement, type ReactNode } from 'react';

interface FinancePanelProps {
  as?: 'article' | 'section' | 'aside' | 'div';
  className?: string;
  title: string;
  kicker?: string;
  action?: ReactNode;
  children: ReactNode;
}

export const FinancePanel = ({
  as = 'section',
  className = '',
  title,
  kicker,
  action,
  children,
}: FinancePanelProps) => {
  return createElement(
    as,
    {
      className: `finance-panel ${className}`.trim(),
    },
    <>
      <header className="finance-panel-head">
        <div>
          {kicker ? <p className="finance-panel-kicker">{kicker}</p> : null}
          <h2>{title}</h2>
        </div>
        {action}
      </header>
      {children}
    </>,
  );
};
