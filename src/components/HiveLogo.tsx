interface HiveLogoProps {
  size?: 'sm' | 'md' | 'lg'
  showWordmark?: boolean
}

const sizes = {
  sm: 'h-9 w-9',
  md: 'h-12 w-12',
  lg: 'h-24 w-24',
}

export function HiveLogo({ size = 'md', showWordmark = true }: HiveLogoProps) {
  return (
    <div className="flex items-center gap-3">
      <div className={`${sizes[size]} overflow-hidden rounded-2xl border border-cyan-300/20 bg-[#061126] shadow-[0_0_30px_rgba(36,200,240,0.12)]`}>
        <img src="/hive-mark.jpg" alt="HIVE neural brain mark" className="h-full w-full object-cover" />
      </div>
      {showWordmark && (
        <div className="leading-none">
          <div className="text-lg font-semibold tracking-[0.28em] text-white">HIVE</div>
          <div className="mt-1 text-[10px] uppercase tracking-[0.22em] text-slate-400">Operations console</div>
        </div>
      )}
    </div>
  )
}
