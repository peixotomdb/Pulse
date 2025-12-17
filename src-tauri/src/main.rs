#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use once_cell::sync::Lazy;
use std::{path::Path, sync::Mutex, time::Instant};
use tauri::{SystemTray, Manager, SystemTrayEvent, SystemTrayMenu, CustomMenuItem};
use tauri_plugin_positioner::{Position, WindowExt};
use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial, NSVisualEffectState};
use sysinfo::{Components, Disks, Networks, System};

static SYSTEM: Lazy<Mutex<System>> = Lazy::new(|| Mutex::new(System::new_all()));
static NETWORKS: Lazy<Mutex<Networks>> = Lazy::new(|| Mutex::new(Networks::new_with_refreshed_list()));
static NETWORK_SNAPSHOT: Lazy<Mutex<Option<NetworkSample>>> = Lazy::new(|| Mutex::new(None));

#[derive(Clone)]
struct NetworkSample {
    rx_total: u64,
    tx_total: u64,
    instant: Instant,
}

#[derive(Clone, serde::Serialize)]
struct SystemStats {
    cpu_percent: f32,
    memory_used_gb: f32,
    memory_total_gb: f32,
    disk_used_gb: f32,
    disk_total_gb: f32,
    net_down_kbps: f32,
    net_up_kbps: f32,
    temperature_c: Option<f32>,
    load_avg_one: f32,
}

#[tauri::command]
fn get_system_stats() -> SystemStats {
    let mut system = SYSTEM.lock().expect("System lock poisoned");

    system.refresh_cpu();
    system.refresh_memory();
    let components = Components::new_with_refreshed_list();
    let disks = Disks::new_with_refreshed_list();

    let cpu_percent = system.global_cpu_info().cpu_usage();
    let memory_used_gb = bytes_to_gb(system.used_memory());
    let memory_total_gb = bytes_to_gb(system.total_memory());

    let (disk_used_bytes, disk_total_bytes) = {
        let mut selected: Option<(u64, u64)> = None;

        for disk in disks.iter() {
            let total = disk.total_space();
            let available = disk.available_space();
            let used = total.saturating_sub(available);

            if disk.mount_point() == Path::new("/") {
                selected = Some((used, total));
                break;
            }

            if let Some((_, current_total)) = selected {
                if total > current_total {
                    selected = Some((used, total));
                }
            } else {
                selected = Some((used, total));
            }
        }

        selected.unwrap_or((0, 0))
    };

    let (net_down_kbps, net_up_kbps) = {
        let mut networks = NETWORKS.lock().expect("Networks lock poisoned");
        networks.refresh();
        compute_network_rates(&networks)
    };

    let temperature_c = components
        .iter()
        .map(|component| component.temperature())
        .filter(|temp| temp.is_finite())
        .reduce(|acc, temp| acc.max(temp));

    let load_avg = System::load_average();

    SystemStats {
        cpu_percent,
        memory_used_gb,
        memory_total_gb,
        disk_used_gb: bytes_to_gb(disk_used_bytes),
        disk_total_gb: bytes_to_gb(disk_total_bytes),
        net_down_kbps,
        net_up_kbps,
        temperature_c,
        load_avg_one: load_avg.one as f32,
    }
}

fn compute_network_rates(networks: &Networks) -> (f32, f32) {
    let (total_rx, total_tx) = networks.iter().fold((0u64, 0u64), |(rx_acc, tx_acc), (_, data)| {
        (
            rx_acc.saturating_add(data.total_received()),
            tx_acc.saturating_add(data.total_transmitted()),
        )
    });

    let mut snapshot = NETWORK_SNAPSHOT.lock().expect("Network snapshot lock poisoned");
    let now = Instant::now();

    let rates = if let Some(prev) = snapshot.as_ref() {
        let elapsed = now.duration_since(prev.instant).as_secs_f32().max(0.001);
        let down = (total_rx.saturating_sub(prev.rx_total) as f32) / 1024.0 / elapsed;
        let up = (total_tx.saturating_sub(prev.tx_total) as f32) / 1024.0 / elapsed;
        (down.max(0.0), up.max(0.0))
    } else {
        (0.0, 0.0)
    };

    *snapshot = Some(NetworkSample {
        rx_total: total_rx,
        tx_total: total_tx,
        instant: now,
    });

    rates
}

fn bytes_to_gb(bytes: u64) -> f32 {
    (bytes as f32) / 1024.0 / 1024.0 / 1024.0
}

fn main() {
    let quit = CustomMenuItem::new("quit".to_string(), "Quit").accelerator("Cmd+Q");

    let system_tray_menu = SystemTrayMenu::new()
        .add_item(quit);

    tauri::Builder::default()
        .plugin(tauri_plugin_positioner::init())
        .invoke_handler(tauri::generate_handler![get_system_stats])
        .system_tray(SystemTray::new().with_menu(system_tray_menu).with_title("Rabbithole"))
        .setup(|app| {
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            app.listen_global("quit",  | _ | {
                std::process::exit(0);
            });

            let window = app.get_window("main").unwrap();
            
            #[cfg(target_os = "macos")]
            apply_vibrancy(
                &window, 
                NSVisualEffectMaterial::Menu, 
                Some(NSVisualEffectState::Active), 
                Some(6.0)
            ).expect("Unsupported platform! 'apply_vibrancy' is only supported on macOS");

            Ok(())
        })
        .on_system_tray_event(|app, event| {
            tauri_plugin_positioner::on_tray_event(app, &event);
            match event {
                SystemTrayEvent::LeftClick {
                    position: _,
                    size: _,
                    ..
                } => {
                    let window = app.get_window("main").unwrap();
                    // use TrayCenter as initial window position
                    let _ = window.move_window(Position::TrayCenter);
                    if window.is_visible().unwrap() {
                        window.hide().unwrap();
                    } else {
                        window.show().unwrap();
                        window.set_focus().unwrap();
                    }
                },
                SystemTrayEvent::MenuItemClick { id, .. } => match id.as_str() {
                    "quit" => {
                        std::process::exit(0);
                    }
                    _ => {}
                },
                _ => {}
            }
        })
        .on_window_event(|event| match event.event() {
            tauri::WindowEvent::Focused(is_focused) => {
                if !is_focused {
                    let _ = event.window().hide();
                }
            }
            _ => {}
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application")
}
