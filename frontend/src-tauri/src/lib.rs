use log::{error, info};
use std::env;

use killport::cli::Mode;
use killport::killport::{Killport, KillportOperations};
use killport::signal::KillportSignal;
use tauri::{Manager, RunEvent, WindowEvent};
use tauri_plugin_shell::ShellExt;

pub fn run() {
    env_logger::init();
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let sidecar = app.shell().sidecar("csemInsight").unwrap();

            tauri::async_runtime::spawn(async move {
                let (_rx, _child) = sidecar.spawn().expect("Failed to spawn sidecar");
            });

            Ok(())
        })
        .on_window_event(|window, event| match event {
            WindowEvent::CloseRequested { api, .. } => {
                if window.label() == "main" {
                    info!("Close requested - exiting app");
                    kill_process(3354);
                    window.app_handle().exit(0);
                }
            }
            WindowEvent::Destroyed => {
                if window.label() == "main" {
                    info!("Window destroyed - exiting app");
                    kill_process(3354);
                    window.app_handle().exit(0);
                }
            }
            _ => {}
        })
        .build(tauri::generate_context!())
        .expect("error while running tauri application");

    app.run(|_app_handle, event| match event {
        RunEvent::ExitRequested { api, .. } => {
            api.prevent_exit();
        }
        RunEvent::Exit => {
            info!("Exiting app");
            kill_process(3354);
        }
        _ => {}
    });
}

fn kill_process(port: u16) {
    let killport = Killport;
    let mode = Mode::Auto;

    let target_killables = match killport.find_target_killables(port, mode) {
        Ok(killables) => killables,
        Err(err) => {
            error!("Error finding killables: {}", err);
            return;
        }
    };

    for killable in target_killables {
        if killable.get_name().contains("csemInsight") {
            let signal: KillportSignal = "SIGKILL".parse().unwrap();

            if let Err(err) = killable.kill(signal) {
                error!("Error killing {}: {}", killable.get_name(), err);
            } else {
                info!("Killed {}", killable.get_name());
            }
        }
    }
}
