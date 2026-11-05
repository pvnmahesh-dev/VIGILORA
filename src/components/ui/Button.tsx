import React from "react";
import { cn } from "@/lib/utils";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "destructive" | "accent";
  size?: "sm" | "md" | "lg";
  isLoading?: boolean;
  isSuccess?: boolean;
  isError?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      className,
      variant = "primary",
      size = "md",
      isLoading = false,
      isSuccess = false,
      isError = false,
      leftIcon,
      rightIcon,
      disabled,
      ...props
    },
    ref
  ) => {
    // The Ghost Bus Tours Token-Driven Base Styles
    // Focus-visible: WCAG 2.2 AA compliant, 200ms motion duration, 6px radius
    const baseStyles =
      "inline-flex items-center justify-center font-oswald uppercase tracking-wider font-semibold transition-all duration-200 focus:outline-none focus-visible:outline-2 focus-visible:outline-[#C00012] focus-visible:outline-offset-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none select-none rounded-md will-change-transform";

    const sizeStyles = {
      sm: "text-[12px] px-3 py-1.5 gap-1.5 min-h-[32px]",
      md: "text-[14px] px-4 py-2 gap-2 min-h-[40px]",
      lg: "text-[16px] px-5 py-2.5 gap-2.5 min-h-[48px]",
    };

    const variantStyles = {
      primary:
        "bg-gradient-to-r from-[#F00018] via-[#C00012] to-[#790009] hover:from-[#ff1a26] hover:to-[#8e000b] hover:shadow-[0_0_16px_rgba(240,0,24,0.4)] text-[#ffffff] shadow-lg shadow-black/60 border border-white/20 active:scale-[0.98]",
      secondary:
        "bg-[#0A0B10] text-[#F2EEE9] border border-[#790009]/40 hover:bg-[#111A29] hover:text-[#ffffff] hover:border-[#C00012] hover:shadow-[0_0_12px_rgba(192,0,18,0.25)] active:scale-[0.98]",
      outline:
        "bg-transparent text-[#F00018] border border-[#C00012]/50 hover:bg-[#790009]/20 hover:border-[#F00018] hover:shadow-[0_0_10px_rgba(240,0,24,0.25)] active:scale-[0.98]",
      accent:
        "bg-[#790009]/30 text-[#F2EEE9] border border-[#C00012]/40 hover:bg-[#790009]/50 hover:border-[#F00018] hover:shadow-[0_0_12px_rgba(240,0,24,0.3)] active:scale-[0.98]",
      ghost:
        "bg-transparent text-[#92929A] hover:bg-white/5 hover:text-[#F2EEE9] border border-transparent active:scale-[0.98]",
      destructive:
        "bg-[#790009]/50 text-red-100 border border-[#F00018]/60 hover:bg-[#790009]/80 hover:shadow-[0_0_14px_rgba(240,0,24,0.4)] active:scale-[0.98]",
    };

    const stateStyles = isSuccess
      ? "!border-emerald-500/70 !text-emerald-300 !bg-emerald-950/40 shadow-[0_0_12px_rgba(16,185,129,0.25)]"
      : isError
      ? "!border-[#F00018] !text-red-200 !bg-[#790009]/60 shadow-[0_0_12px_rgba(240,0,24,0.35)]"
      : "";

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        aria-busy={isLoading ? "true" : undefined}
        className={cn(baseStyles, sizeStyles[size], variantStyles[variant], stateStyles, className)}
        {...props}
      >
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin text-current shrink-0" />
        ) : isSuccess ? (
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 animate-scale-check" />
        ) : isError ? (
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
        ) : (
          leftIcon && <span className="inline-flex shrink-0">{leftIcon}</span>
        )}
        <span>{children}</span>
        {!isLoading && !isSuccess && !isError && rightIcon && (
          <span className="inline-flex shrink-0">{rightIcon}</span>
        )}
      </button>
    );
  }
);

Button.displayName = "Button";
