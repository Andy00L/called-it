'use client';

import type { ButtonHTMLAttributes } from 'react';
import { buttonClassName, type ButtonVariant } from './button-styles';

function ButtonSpinner() {
  return (
    <svg
      aria-hidden
      width="13"
      height="13"
      viewBox="0 0 14 14"
      fill="none"
      className="animate-[spin-once_900ms_linear_infinite]"
    >
      <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeOpacity="0.3" strokeWidth="1.6" />
      <path
        d="M7 1.5A5.5 5.5 0 0 1 12.5 7"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

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
      className={buttonClassName(variant, className)}
      {...rest}
    >
      {isLoading ? <ButtonSpinner /> : null}
      {children}
    </button>
  );
}
