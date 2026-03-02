import React, { type ComponentPropsWithoutRef, type ElementType, type ReactNode } from 'react';

type SurfaceCardProps<C extends ElementType = 'article'> = {
  as?: C;
  children: ReactNode;
  className?: string;
  hoverable?: boolean;
  corners?: boolean;
} & Omit<ComponentPropsWithoutRef<C>, 'as' | 'className' | 'children'>;

export const SurfaceCard = <C extends ElementType = 'article'>({
  as,
  children,
  className = '',
  hoverable = false,
  corners = false,
  ...restProps
}: SurfaceCardProps<C>) => {
  const Component = as ?? 'article';
  const classes = [
    'hud-panel',
    corners ? 'hud-corners' : '',
    hoverable ? 'hud-hover' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return React.createElement(Component, { className: classes, ...(restProps as object) }, children);
};
