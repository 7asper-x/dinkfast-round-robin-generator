import * as React from "react";
import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
};

const baseStyles =
  "inline-flex items-center justify-center font-semibold rounded-lg transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500 disabled:opacity-50 disabled:cursor-not-allowed";

const sizeStyles: Record<NonNullable<ButtonProps["size"]>, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-11 px-4 text-sm",
  lg: "h-12 px-5 text-base",
};

const variantStyles: Record<NonNullable<ButtonProps["variant"]>, string> = {
  default: "bg-slate-900 text-white hover:bg-slate-800",
  outline:
    "border border-slate-300 text-slate-900 hover:bg-slate-100 dark:text-white dark:border-slate-700",
  ghost: "text-slate-900 hover:bg-slate-100 dark:text-white",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "md", ...props }, ref) => (
    <button
      ref={ref}
      className={cn(baseStyles, sizeStyles[size], variantStyles[variant], className)}
      {...props}
    />
  ),
);

Button.displayName = "Button";

