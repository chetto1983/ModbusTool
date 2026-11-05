pub mod commands;
pub mod describe;
pub mod frame_io;
pub mod link;
pub mod master;
pub mod poller;
pub mod slave;
pub mod slave_server;
pub mod traffic;

use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            let state = commands::AppState::new(app.handle());
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::serial_ports,
            commands::master_connect,
            commands::master_disconnect,
            commands::master_execute,
            commands::poll_start,
            commands::poll_stop,
            commands::slave_start,
            commands::slave_stop,
            commands::slave_set_units,
            commands::slave_read,
            commands::slave_write,
        ])
        .run(tauri::generate_context!())
        .expect("error while running ModbusTool");
}
