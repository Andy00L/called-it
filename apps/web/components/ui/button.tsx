'use client';

import type { ButtonHTMLAttributes } from 'react';

type ButtonVariant = 'primary' | 'ghost' | 'destructive';

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-field font-semibold hover:bg-accent-deep active:scale-[0.97] disabled:bg-line disabled:text-ink-faint',
  ghost:
    'border border-line text-ink hover:border-ink-muted active:scale-[0.97] disabled:text-ink-faint disabled:border-line',
  destructive:
    'border border-miss text-miss hover:bg-miss/10 active:scale-[0.97] disabled:opacity-50',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  isLoading?: boolean;
}

export function Button({
  variant = 'primary',
  isLoading = false,
  disabled,
  children,
  className = '',
  ...rest
}: ButtonProps) {
  return (
    <button
      disabled={disabled === true || isLoading}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-chip px-4 py-2 text-sm transition-[background-color,border-color,transform] duration-[var(--duration-small)] ease-[var(--ease-standard)] disabled:cursor-not-allowed ${VARIANT_CLASSES[variant]} ${className}`}
      {...rest}
    >
      {isLoading ? <span aria-hidden className="animate-pulse">•••</span> : children}
    </button>
  );
}
