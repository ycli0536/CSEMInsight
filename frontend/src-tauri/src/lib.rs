use std::net::TcpListener;
use std::sync::Mutex;

use log::{error, info, warn};
use tauri::{AppHandle, Manager, RunEvent, State, WindowEvent};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

/// Port the backend uses when it is free, so a single running instance keeps
/// the address the docs and dev tooling refer to.
const PREFERRED_PORT: u16 = 3354;

/// The backend process this window owns, and the port it was told to use.
#[derive(Default)]
struct Backend {
    port: Option<u16>,
    child: Option<CommandChild>,
}

struct BackendState(Mutex<Backend>);

/// Reserve a loopback port for the backend to listen on.
///
/// Prefers [`PREFERRED_PORT`] and falls back to whatever the OS hands out, so
/// a second instance of the app gets its own backend instead of colliding with
/// the first one. The listener is dropped before the sidecar starts, which
/// leaves a brief window where another process could take the port; the
/// backend simply fails to bind if that happens, and the frontend reports an
/// unreachable backend.
fn reserve_port() -> Option<u16> {
    if TcpListener::bind(("127.0.0.1", PREFERRED_PORT)).is_ok() {
        return Some(PREFERRED_PORT);
    }

    match TcpListener::bind(("127.0.0.1", 0)) {
        Ok(listener) => listener.local_addr().ok().map(|address| address.port()),
        Err(err) => {
            error!("Could not reserve a port for the backend: {}", err);
            None
        }
    }
}

/// Port of the backend serving this window, for the frontend to build API URLs.
#[tauri::command]
fn get_api_port(state: State<'_, BackendState>) -> Result<u16, String> {
    state
        .0
        .lock()
        .map_err(|_| "Backend state is unavailable.".to_string())?
        .port
        .ok_or_else(|| "The backend process is not running.".to_string())
}

/// Start the backend sidecar and record it in `BackendState`.
///
/// Failures are logged rather than fatal: the window still opens, and the
/// frontend surfaces an unreachable backend instead of the app dying at
/// startup with a panic the user cannot read.
fn start_backend(app: &AppHandle) {
    let Some(port) = reserve_port() else {
        return;
    };

    let sidecar = match app.shell().sidecar("csemInsight") {
        Ok(command) => command.args(["--port", &port.to_string()]),
        Err(err) => {
            error!("Could not locate the backend sidecar: {}", err);
            return;
        }
    };

    let (mut receiver, child) = match sidecar.spawn() {
        Ok(spawned) => spawned,
        Err(err) => {
            error!("Could not start the backend sidecar: {}", err);
            return;
        }
    };

    match app.state::<BackendState>().0.lock() {
        Ok(mut backend) => {
            backend.port = Some(port);
            backend.child = Some(child);
        }
        Err(_) => {
            error!("Backend state is unavailable; not tracking the sidecar.");
            return;
        }
    }

    info!("Backend listening on 127.0.0.1:{}", port);

    // Forward the backend's output to the app log; it is otherwise discarded,
    // which makes a crashed backend invisible.
    tauri::async_runtime::spawn(async move {
        while let Some(event) = receiver.recv().await {
            match event {
                CommandEvent::Stdout(line) | CommandEvent::Stderr(line) => {
                    info!("[backend] {}", String::from_utf8_lossy(&line).trim_end());
                }
                CommandEvent::Terminated(payload) => {
                    warn!("Backend exited with status {:?}", payload.code);
                    break;
                }
                _ => {}
            }
        }
    });
}

/// Stop the backend this app started.
///
/// Only the tracked child is killed. Matching by port would kill the backend
/// of another running instance of the app.
fn stop_backend(app: &AppHandle) {
    let Some(state) = app.try_state::<BackendState>() else {
        return;
    };

    let child = state.0.lock().ok().and_then(|mut backend| backend.child.take());
    let Some(child) = child else {
        return;
    };

    match child.kill() {
        Ok(()) => info!("Backend stopped"),
        Err(err) => error!("Could not stop the backend: {}", err),
    }
}

pub fn run() {
    env_logger::init();
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .manage(BackendState(Mutex::new(Backend::default())))
        .invoke_handler(tauri::generate_handler![get_api_port])
        .setup(|app| {
            start_backend(app.handle());
            Ok(())
        })
        .on_window_event(|window, event| match event {
            WindowEvent::CloseRequested { api: _, .. } => {
                if window.label() == "main" {
                    info!("Close requested - exiting app");
                }
            }
            WindowEvent::Destroyed => {
                if window.label() == "main" {
                    info!("Window destroyed - exiting app");
                    let app_handle = window.app_handle();
                    stop_backend(app_handle);
                    app_handle.exit(0);
                    std::process::exit(0);
                }
            }
            _ => {}
        })
        .build(tauri::generate_context!())
        .expect("error while running tauri application");

    app.run(|app_handle, event| match event {
        RunEvent::ExitRequested { api, .. } => {
            api.prevent_exit();
        }
        RunEvent::Exit => {
            info!("Exiting app");
            stop_backend(app_handle);
        }
        _ => {}
    });
}
