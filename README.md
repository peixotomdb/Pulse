# Pulse

Pulse is a small macOS menu bar system monitor.
It shows a quick snapshot of your Mac’s system state without dashboards, charts, or noise.

<p align="center">
  <img src="src-tauri/icons/icon.png" alt="Pulse icon" width="160" />
</p>
<p align="center">
  <img src="https://img.shields.io/badge/Platform-macOS-blue.svg" alt="Platform: macOS" />
  <img src="https://img.shields.io/badge/License-MIT-green.svg" alt="License: MIT" />


---

## Features

- CPU usage
- Memory usage (used / total)
- Disk usage
- Load average
- Temperature (best-effort, may be unavailable on some systems)
- Network throughput
- Quick settings (°C / °F, accent color)
- Keyboard shortcuts

---

## Tech Stack

- Tauri (Rust)
- React + Vite
- Tailwind CSS
- sysinfo

macOS only.

---

## Running locally

### Requirements

- macOS  
- Node.js + pnpm  
- Rust toolchain  

### Development
```bash
pnpm install
pnpm tauri dev
```
### Build
```bash
pnpm tauri build
```

The `.app` bundle is generated under `src-tauri/target/release`.

---

<p align="center">
  <img src="src-tauri/resources/pulse.png" alt="Pulse window" width="320" />
</p>

---

## Future

- GPU metrics
- Battery health info  

No promises.

---

Open source. Do whatever you want with it.