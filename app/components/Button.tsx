import React from 'react';

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  fullWidth?: boolean;
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = '', variant = 'primary', fullWidth = false, children, ...props }, ref) => {
    
    let variantStyles = '';
    switch (variant) {
      case 'primary':
        variantStyles = 'bg-[var(--color-brand-primary)] text-black hover:bg-opacity-80 hover:shadow-[0_0_15px_var(--color-brand-primary)]';
        break;
      case 'secondary':
        variantStyles = 'bg-[var(--color-brand-secondary)] text-white hover:bg-opacity-80 hover:shadow-[0_0_15px_var(--color-brand-secondary)]';
        break;
      case 'danger':
        variantStyles = 'bg-[var(--color-brand-danger)]/20 text-[var(--color-brand-danger)] border border-[var(--color-brand-danger)]/50 hover:bg-[var(--color-brand-danger)] hover:text-white';
        break;
      case 'ghost':
        variantStyles = 'bg-transparent text-[var(--color-brand-text)] hover:bg-white/10';
        break;
    }

    const widthStyles = fullWidth ? 'w-full' : '';

    return (
      <button
        ref={ref}
        className={`font-bold py-3 px-6 rounded transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none ${variantStyles} ${widthStyles} ${className}`}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
