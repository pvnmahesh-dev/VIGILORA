import React from "react";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "destructive" | "accent";
  size?: "sm" | "md" | "lg";
  isLoading?: boolean;
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
      leftIcon,
      rightIcon,
      disabled,
      ...props
    },
    ref
  ) => {
    // The Ghost Bus Tours Token-Driven Base Styles
    // Focus-visible: WCAG 2.2 AA compliant, 300ms motion duration, 8px radius
    const baseStyles =
      "inline-flex items-center justify-center font-oswald uppercase tracking-wider font-semibold transition-all duration-300 focus:outline-none focus-visible:outline-2 focus-visible:outline-[#C00012] focus-visible:outline-offset-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none select-none rounded-md";

    const sizeStyles = {
      sm: "text-[12px] px-3 py-1.5 gap-1.5 min-h-[32px]",
      md: "text-[14px] px-4 py-2 gap-2 min-h-[40px]",
      lg: "text-[16px] px-5 py-2.5 gap-2.5 min-h-[48px]",
    };

    const variantStyles = {
      primary:
        "bg-gradient-to-r from-[#F00018] via-[#C00012] to-[#790009] hover:from-[#ff1a26] hover:to-[#8e000b] text-[#ffffff] shadow-lg shadow-black/60 border border-white/20 active:scale-[0.98]",
      secondary:
        "bg-[#0A0B10] text-[#F2EEE9] border border-[#790009]/40 hover:bg-[#111A29] hover:text-[#ffffff] hover:border-[#C00012] active:scale-[0.98]",
      outline:
        "bg-transparent text-[#F00018] border border-[#C00012]/50 hover:bg-[#790009]/20 hover:border-[#F00018] active:scale-[0.98]",
      accent:
        "bg-[#790009]/30 text-[#F2EEE9] border border-[#C00012]/40 hover:bg-[#790009]/50 hover:border-[#F00018] active:scale-[0.98]",
      ghost:
        "bg-transparent text-[#92929A] hover:bg-white/5 hover:text-[#F2EEE9] border border-transparent",
      destructive:
        "bg-[#790009]/50 text-red-100 border border-[#F00018]/60 hover:bg-[#790009]/80 active:scale-[0.98]",
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        aria-busy={isLoading ? "true" : undefined}
        className={cn(baseStyles, sizeStyles[size], variantStyles[variant], className)}
        {...props}
      >
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin text-current" />
        ) : (
          leftIcon && <span className="inline-flex shrink-0">{leftIcon}</span>
        )}
        <span>{children}</span>
        {!isLoading && rightIcon && (
          <span className="inline-flex shrink-0">{rightIcon}</span>
        )}
      </button>
    );
  }
);

Button.displayName = "Button";
