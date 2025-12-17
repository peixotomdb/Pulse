import { twMerge } from "tailwind-merge";

export interface ProgressBarProps {
  progress: number
  className?: string
  colorClass?: string
}

export function ProgressBar({ progress, className, colorClass = 'bg-violet-300' }: ProgressBarProps) {
  const clampedProgress = Math.min(100, Math.max(0, progress))

  return (
    <div 
      role="progressbar" 
      aria-valuemax={100} 
      aria-valuenow={clampedProgress} 
      className={twMerge("h-2 rounded-sm bg-white/10 w-40", className)}
    >
      <div 
        className={twMerge("h-2 rounded-sm transition-all", colorClass)} 
        style={{ width: `${clampedProgress}%` }} 
      />
    </div>
  )
}
