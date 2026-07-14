import React from 'react';

type CardProps = {
  title?: string;
  children: React.ReactNode;
  className?: string;
  variant?: 'default' | 'danger' | 'highlight';
};

export function Card({ title, children, className = '', variant = 'default' }: CardProps) {
  let variantStyles = '';
  switch (variant) {
    case 'danger':
      variantStyles = 'border-[var(--color-brand-danger)]/30';
      break;
    case 'highlight':
      variantStyles = 'border-[var(--color-brand-primary)]/50 shadow-[0_0_20px_rgba(0,240,255,0.1)]';
      break;
    default:
      variantStyles = '';
      break;
  }

  return (
    <section className={`glass-panel p-6 ${variantStyles} ${className}`}>
      {title && <h3 className={`text-xl font-bold mb-4 ${variant === 'danger' ? 'text-[var(--color-brand-danger)]' : ''}`}>{title}</h3>}
      {children}
    </section>
  );
}
