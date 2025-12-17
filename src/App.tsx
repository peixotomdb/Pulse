import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { emit } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/tauri";
import { appWindow, LogicalSize } from "@tauri-apps/api/window";
import { Activity, ArrowDownToLine, ArrowUpToLine, Cpu, Gauge, HardDrive, Palette, PowerOff, RefreshCw, Settings2, Thermometer } from "lucide-react";

import { MenuItem } from "./components/menu-item";
import { Separator } from "./components/separator";
import { ProgressBar } from "./components/progress-bar";

type SystemStats = {
  cpu_percent: number
  memory_used_gb: number
  memory_total_gb: number
  disk_used_gb: number
  disk_total_gb: number
  net_down_kbps: number
  net_up_kbps: number
  temperature_c: number | null
  load_avg_one: number
}

export function App() {
  const [stats, setStats] = useState<SystemStats | null>(null)
  const [isFetching, setIsFetching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [contentSize, setContentSize] = useState({ width: 0, height: 0 })
  const containerRef = useRef<HTMLDivElement>(null)
  const lastWindowSize = useRef({ width: 0, height: 0 })
  const [temperatureUnit, setTemperatureUnit] = useState<'celsius' | 'fahrenheit'>('celsius')
  const accentOptions = {
    violet: { bar: 'bg-violet-300', hex: '#c4b5fd', muted: '#ddd6fe' },
    sky: { bar: 'bg-sky-300', hex: '#7dd3fc', muted: '#bae6fd' },
    emerald: { bar: 'bg-emerald-300', hex: '#6ee7b7', muted: '#a7f3d0' },
    amber: { bar: 'bg-amber-300', hex: '#fcd34d', muted: '#fde68a' },
    rose: { bar: 'bg-rose-300', hex: '#fda4af', muted: '#fecdd3' },
  } as const
  type AccentKey = keyof typeof accentOptions
  const [accentColor, setAccentColor] = useState<AccentKey>('violet')
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [networkHistory, setNetworkHistory] = useState<Array<{ down: number; up: number }>>([])

  const fetchStats = useCallback(async () => {
    setIsFetching(true)

    try {
      const response = await invoke<SystemStats>('get_system_stats')
      setStats(response)
      setError(null)
    } catch (err) {
      console.error(err)
      setError('Unable to read system metrics.')
    } finally {
      setIsFetching(false)
    }
  }, [])

  useEffect(() => {
    if (!containerRef.current) {
      return
    }

    const observer = new ResizeObserver(entries => {
      const entry = entries[0]
      const target = entry.target as HTMLElement
      const rect = target.getBoundingClientRect()
      const styles = window.getComputedStyle(target)
      const marginX = parseFloat(styles.marginLeft) + parseFloat(styles.marginRight)
      const marginY = parseFloat(styles.marginTop) + parseFloat(styles.marginBottom)

      setContentSize({
        width: rect.width + marginX,
        height: rect.height + marginY,
      })
    })

    observer.observe(containerRef.current)

    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!contentSize.width || !contentSize.height) {
      return
    }

    const width = Math.ceil(contentSize.width)
    const height = Math.ceil(contentSize.height)

    const prevWidth = lastWindowSize.current.width
    const prevHeight = lastWindowSize.current.height

    if (Math.abs(width - prevWidth) < 1 && Math.abs(height - prevHeight) < 1) {
      return
    }

    lastWindowSize.current = { width, height }

    appWindow.setSize(new LogicalSize(width, height)).catch(console.error)
  }, [contentSize])

  useEffect(() => {
    fetchStats()

    const id = setInterval(fetchStats, 500)
    return () => clearInterval(id)
  }, [fetchStats])

  useEffect(() => {
    if (!stats) return

    setNetworkHistory(prev => {
      const last = prev[prev.length - 1]
      const smoothing = 0.35
      const downSample = last
        ? last.down + (stats.net_down_kbps - last.down) * smoothing
        : stats.net_down_kbps
      const upSample = last
        ? last.up + (stats.net_up_kbps - last.up) * smoothing
        : stats.net_up_kbps

      const next = [...prev, { down: downSample, up: upSample }]
      if (next.length > 120) {
        next.shift()
      }
      return next
    })
  }, [stats])

  const cpuPercent = useMemo(() => {
    if (!stats) return 0
    return Math.round(stats.cpu_percent)
  }, [stats])

  const memoryPercent = useMemo(() => {
    if (!stats || stats.memory_total_gb === 0) return 0
    return Math.round((stats.memory_used_gb / stats.memory_total_gb) * 100)
  }, [stats])

  const diskPercent = useMemo(() => {
    if (!stats || stats.disk_total_gb === 0) return 0
    return Math.round((stats.disk_used_gb / stats.disk_total_gb) * 100)
  }, [stats])

  const accentBarClass = accentOptions[accentColor].bar
  const accentStroke = accentOptions[accentColor].hex
  const accentMutedStroke = accentOptions[accentColor].muted

  const networkSparkline = useMemo(() => {
    if (networkHistory.length === 0) {
      return null
    }

    const width = 200
    const height = 48
    const points = networkHistory
    const maxValue = Math.max(
      1,
      ...points.map(point => Math.max(point.down, point.up)),
    )

    const buildPath = (selector: (point: { down: number; up: number }) => number) => {
      return points.map((point, index) => {
        const x = points.length === 1 ? width : (index / (points.length - 1)) * width
        const value = selector(point)
        const y = height - (value / maxValue) * height
        return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
      }).join(' ')
    }

    return {
      width,
      height,
      downPath: buildPath(point => point.down),
      upPath: buildPath(point => point.up),
    }
  }, [networkHistory])

  useEffect(() => {
    const storedUnit = localStorage.getItem('temperature-unit')
    const storedAccent = localStorage.getItem('accent-color')

    if (storedUnit === 'celsius' || storedUnit === 'fahrenheit') {
      setTemperatureUnit(storedUnit)
    }

    if (storedAccent && storedAccent in accentOptions) {
      setAccentColor(storedAccent as AccentKey)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    localStorage.setItem('temperature-unit', temperatureUnit)
  }, [temperatureUnit])

  useEffect(() => {
    localStorage.setItem('accent-color', accentColor)
  }, [accentColor])

  function handleQuitApp() {
    emit('quit')
  }

  function formatTemperature() {
    if (!stats) return '—'

    if (stats.temperature_c === null) {
      return 'No sensor'
    }

    const value = temperatureUnit === 'celsius'
      ? stats.temperature_c
      : stats.temperature_c * 9 / 5 + 32

    return `${value.toFixed(1)}°${temperatureUnit === 'celsius' ? 'C' : 'F'}`
  }

  function formatRate(value: number | undefined) {
    if (value === undefined || value < 0.1) {
      return '0 KB/s'
    }

    return `${value.toFixed(1)} KB/s`
  }

  const latestNetwork = networkHistory[networkHistory.length - 1]

  return (
    <div
      ref={containerRef}
      className="m-3 w-[360px] space-y-6 px-3 py-4 text-white/90"
    >
      <section className="space-y-4 rounded-md border border-white/10 bg-white/5 p-3">
        {error && (
          <p className="text-xs text-red-300">{error}</p>
        )}

        <div className="space-y-3 text-sm">
          <div>
            <div className="flex items-center justify-between text-white/70">
              <div className="flex items-center gap-2">
                <Cpu className="h-4 w-4 stroke-[1.5px]" />
                <span>CPU</span>
              </div>
              <span className="font-semibold text-white">
                {stats ? `${cpuPercent}%` : '—'}
              </span>
            </div>
            <ProgressBar progress={cpuPercent} className="mt-1 w-full" colorClass={accentBarClass} />
          </div>

          <div>
            <div className="flex items-center justify-between text-white/70">
              <div className="flex items-center gap-2">
                <Gauge className="h-4 w-4 stroke-[1.5px]" />
                <span>Memory</span>
              </div>
              <span className="font-semibold text-white">
                {stats ? `${memoryPercent}%` : '—'}
              </span>
            </div>
            <ProgressBar progress={memoryPercent} className="mt-1 w-full" colorClass={accentBarClass} />
            <p className="mt-1 text-[11px] text-white/50">
              {stats ? `${stats.memory_used_gb.toFixed(2)} / ${stats.memory_total_gb.toFixed(2)} GB` : '—'}
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between text-white/70">
              <div className="flex items-center gap-2">
                <HardDrive className="h-4 w-4 stroke-[1.5px]" />
                <span>Disk</span>
              </div>
              <span className="font-semibold text-white">
                {stats ? `${diskPercent}%` : '—'}
              </span>
            </div>
            <ProgressBar progress={diskPercent} className="mt-1 w-full" colorClass={accentBarClass} />
            <p className="mt-1 text-[11px] text-white/50">
              {stats ? `${stats.disk_used_gb.toFixed(2)} / ${stats.disk_total_gb.toFixed(2)} GB` : '—'}
            </p>
          </div>

          <div className="flex items-center justify-between text-white/70">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 stroke-[1.5px]" />
              <span>Load (1m)</span>
            </div>
            <span className="font-semibold text-white">
              {stats ? stats.load_avg_one.toFixed(2) : '—'}
            </span>
          </div>

          <div className="flex items-center justify-between text-white/70">
            <div className="flex items-center gap-2">
              <Thermometer className="h-4 w-4 stroke-[1.5px]" />
              <span>Temperature</span>
            </div>
            <span className="font-semibold text-white">
              {formatTemperature()}
            </span>
          </div>

          <div>
            <div className="flex items-center justify-between text-white/70">
              <div className="flex items-center gap-2">
                <ArrowDownToLine className="h-4 w-4 stroke-[1.5px]" />
                <span>Network</span>
              </div>
              <span className="text-xs uppercase tracking-[0.3em] text-white/40">
                Last 60s
              </span>
            </div>

            <div className="mt-2 rounded-md border border-white/10 bg-white/5 p-2">
              {networkSparkline && networkHistory.length > 1 ? (
                <svg
                  width="100%"
                  height="56"
                  viewBox={`0 0 ${networkSparkline.width} ${networkSparkline.height}`}
                  preserveAspectRatio="none"
                  className="overflow-visible"
                >
                  <path
                    d={networkSparkline.upPath}
                    stroke={accentMutedStroke}
                    strokeWidth="1.5"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ transition: 'all 0.3s ease' }}
                    opacity="0.65"
                  />
                  <path
                    d={networkSparkline.downPath}
                    stroke={accentStroke}
                    strokeWidth="2"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ transition: 'all 0.3s ease' }}
                  />
                </svg>
              ) : (
                <p className="text-xs text-white/60">Collecting data…</p>
              )}
            </div>

            <div className="mt-2 flex gap-2">
              <div className="flex-1 rounded-md border border-white/10 bg-white/5 p-2 text-xs text-white/80">
                <p className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-white/50">
                  <ArrowDownToLine className="h-3 w-3" />
                  Down
                </p>
                <p className="mt-1 text-lg font-semibold text-white">
                  {formatRate(latestNetwork?.down ?? stats?.net_down_kbps)}
                </p>
              </div>

              <div className="flex-1 rounded-md border border-white/10 bg-white/5 p-2 text-xs text-white/80">
                <p className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-white/50">
                  <ArrowUpToLine className="h-3 w-3" />
                  Up
                </p>
                <p className="mt-1 text-lg font-semibold text-white">
                  {formatRate(latestNetwork?.up ?? stats?.net_up_kbps)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {isSettingsOpen && (
        <section className="space-y-3 rounded-md border border-white/10 bg-white/5 p-3 text-xs text-white/80">
          <div className="flex items-center justify-between text-sm font-semibold text-white">
            <div className="flex items-center gap-2">
              <Settings2 className="h-4 w-4" />
              <span>Quick settings</span>
            </div>
            <button
              onClick={() => setIsSettingsOpen(false)}
              className="text-white/60 transition hover:text-white"
            >
              Close
            </button>
          </div>

          <div className="space-y-2">
            <p className="text-[11px] uppercase tracking-[0.2em] text-white/40">
              Temperature
            </p>
            <div className="flex gap-2">
              {(['celsius', 'fahrenheit'] as const).map(unit => (
                <button
                  key={unit}
                  onClick={() => setTemperatureUnit(unit)}
                  className={`flex-1 rounded-md border px-2 py-1 text-sm font-medium transition ${
                    temperatureUnit === unit
                      ? 'border-white/70 bg-white/10 text-white'
                      : 'border-white/10 text-white/60 hover:border-white/30'
                  }`}
                >
                  {unit === 'celsius' ? '°C' : '°F'}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-[11px] uppercase tracking-[0.2em] text-white/40 flex items-center gap-2">
              <Palette className="h-3 w-3" />
              Accent color
            </p>
            <div className="flex gap-2">
              {(Object.keys(accentOptions) as AccentKey[]).map(option => (
                <button
                  key={option}
                  onClick={() => setAccentColor(option)}
                  className={`h-7 w-7 rounded-full border-2 transition ${accentOptions[option].bar} ${
                    accentColor === option ? 'border-white' : 'border-transparent opacity-70 hover:opacity-100'
                  }`}
                  title={option}
                />
              ))}
            </div>
          </div>
        </section>
      )}

      <Separator />

      <nav className="px-1.5">
        <MenuItem 
          onClick={() => setIsSettingsOpen(prev => !prev)}
          aria-pressed={isSettingsOpen}
          hotkey="mod+,"
        >
          <Settings2 className="h-4 w-4 stroke-[1.5px]" />
          {isSettingsOpen ? 'Close settings' : 'Open settings'}
        </MenuItem>

        <MenuItem 
          onClick={fetchStats} 
          hotkey="mod+r" 
          disabled={isFetching}
        >
          <RefreshCw className={`h-4 w-4 stroke-[1.5px] ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </MenuItem>

        <MenuItem onClick={handleQuitApp} hotkey="mod+q" className="py-1">
          <PowerOff className="h-4 w-4 stroke-[1.5px]" />
          Quit
        </MenuItem>
      </nav>
    </div>
  );
}
