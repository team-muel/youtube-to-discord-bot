import React, { type ReactNode } from 'react';
import { Link } from 'react-router-dom';

type Variant = 'outline' | 'accent' | 'solid' | 'ghost' | 'tab';
type Size = 'sm' | 'md' | 'lg';

interface UiButtonProps {
  children: ReactNode;
  to?: string;
  href?: string;
  variant?: Variant;
  size?: Size;
  active?: boolean;
  className?: string;
  ariaLabel?: string;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
  onClick?: React.MouseEventHandler<HTMLButtonElement | HTMLAnchorElement>;
  title?: string;
  target?: string;
  rel?: string;
  benchmarkEvent?: string;
  benchmarkId?: string;
  benchmarkLabel?: string;
  benchmarkArea?: string;
}

const baseClasses = 'cta-subtle ui-btn';

const sizeClasses: Record<Size, string> = {
  sm: 'ui-btn-size-sm',
  md: 'ui-btn-size-md',
  lg: 'ui-btn-size-lg',
};

const getVariantClasses = (variant: Variant, active: boolean) => {
  switch (variant) {
    case 'accent':
      return 'ui-btn-variant-accent';
    case 'solid':
      return 'ui-btn-variant-solid';
    case 'ghost':
      return 'ui-btn-variant-ghost';
    case 'tab':
      return active ? 'ui-btn-variant-tab-active' : 'ui-btn-variant-tab';
    case 'outline':
    default:
      return 'ui-btn-variant-outline';
  }
};

export const UiButton: React.FC<UiButtonProps> = ({
  children,
  to,
  href,
  variant = 'outline' as Variant,
  size = 'md' as Size,
  active = false,
  className = '',
  ariaLabel,
  disabled = false,
  type = 'button',
  onClick,
  title,
  target,
  rel,
  benchmarkEvent,
  benchmarkId,
  benchmarkLabel,
  benchmarkArea,
}) => {
  const disabledClasses = disabled ? 'ui-btn-disabled' : '';
  const classes = `${baseClasses} ${sizeClasses[size]} ${getVariantClasses(variant, active)} ${disabledClasses} ${className}`.trim();

  if (to) {
    return (
      <Link
        to={to}
        className={classes}
        aria-label={ariaLabel}
        aria-disabled={disabled}
        onClick={onClick as React.MouseEventHandler<HTMLAnchorElement> | undefined}
        title={title}
        data-benchmark-event={benchmarkEvent}
        data-benchmark-id={benchmarkId}
        data-benchmark-label={benchmarkLabel}
        data-benchmark-area={benchmarkArea}
      >
        {children}
      </Link>
    );
  }

  if (href) {
    const isExternal = /^https?:\/\//.test(href);
    return (
      <a
        href={href}
        className={classes}
        aria-label={ariaLabel}
        aria-disabled={disabled}
        onClick={onClick as React.MouseEventHandler<HTMLAnchorElement> | undefined}
        title={title}
        target={target ?? (isExternal ? '_blank' : undefined)}
        rel={rel ?? (isExternal ? 'noopener noreferrer' : undefined)}
        data-benchmark-event={benchmarkEvent}
        data-benchmark-id={benchmarkId}
        data-benchmark-label={benchmarkLabel}
        data-benchmark-area={benchmarkArea}
      >
        {children}
      </a>
    );
  }

  return (
    <button
      type={type}
      className={classes}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick as React.MouseEventHandler<HTMLButtonElement> | undefined}
      title={title}
      data-benchmark-event={benchmarkEvent}
      data-benchmark-id={benchmarkId}
      data-benchmark-label={benchmarkLabel}
      data-benchmark-area={benchmarkArea}
    >
      {children}
    </button>
  );
};
