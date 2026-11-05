pub mod describe;
pub mod frame_io;
pub mod link;
pub mod master;
pub mod poller;
pub mod slave;
pub mod slave_server;
pub mod traffic;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .run(tauri::generate_context!())
        .expect("error while running ModbusTool");
}
