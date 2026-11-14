#![windows_subsystem = "windows"]

use std::path::PathBuf;
use tao::{
    dpi::LogicalSize,
    event::{Event, WindowEvent},
    event_loop::{ControlFlow, EventLoop},
    window::{Icon, WindowBuilder},
};
use wry::{http::Response, WebContext, WebViewBuilder};

const INDEX_HTML: &[u8] = include_bytes!("../../dist-portable/index.html");

fn create_app_icon() -> Option<Icon> {
    let size = 32usize;
    let mut rgba = vec![0u8; size * size * 4];
    for y in 0..size {
        for x in 0..size {
            let idx = (y * size + x) * 4;
            let dx = x as f32 - 15.5;
            let dy = y as f32 - 15.5;
            if dx * dx + dy * dy <= 15.0 * 15.0 {
                let nx = (x as f32) / 31.0;
                let ny = (y as f32) / 31.0;
                let in_bolt = (ny >= 0.16
                    && ny <= 0.55
                    && nx >= (0.56 - (ny - 0.16) * 0.65)
                    && nx <= (0.68 - (ny - 0.16) * 0.40))
                    || (ny >= 0.45
                        && ny <= 0.84
                        && nx >= (0.34 + (0.84 - ny) * 0.25)
                        && nx <= (0.66 - (ny - 0.45) * 0.62));
                if in_bolt {
                    rgba[idx] = 255;
                    rgba[idx + 1] = 255;
                    rgba[idx + 2] = 255;
                    rgba[idx + 3] = 255;
                } else {
                    rgba[idx] = 37;
                    rgba[idx + 1] = 99;
                    rgba[idx + 2] = 235;
                    rgba[idx + 3] = 255;
                }
            }
        }
    }
    Icon::from_rgba(rgba, size as u32, size as u32).ok()
}

fn app_data_dir(folder: &str) -> PathBuf {
    std::env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(std::env::temp_dir)
        .join(folder)
}

fn main() {
    let event_loop = EventLoop::new();
    let mut builder = WindowBuilder::new()
        .with_title("MạchĐiệnLab — Mô Phỏng Mạch Điện & Hệ Thống Điện")
        .with_inner_size(LogicalSize::new(1380.0, 860.0))
        .with_min_inner_size(LogicalSize::new(980.0, 640.0));

    if let Some(icon) = create_app_icon() {
        builder = builder.with_window_icon(Some(icon));
    }

    let window = builder.build(&event_loop).expect("Khởi tạo cửa sổ thất bại");
    let data_dir = app_data_dir("MachDienLab-VI");
    let _ = std::fs::create_dir_all(&data_dir);
    let mut web_context = WebContext::new(Some(data_dir));

    let _webview = WebViewBuilder::new_with_web_context(&mut web_context)
        .with_custom_protocol("machdienlab".into(), |_id, _req| {
            Response::builder()
                .status(200)
                .header("Content-Type", "text/html; charset=utf-8")
                .body(std::borrow::Cow::Borrowed(INDEX_HTML))
                .unwrap()
        })
        .with_url("machdienlab://localhost/")
        .with_focused(true)
        .with_download_started_handler(|_url, _path| true)
        .build(&window)
        .expect("Khởi tạo WebView2 thất bại");

    event_loop.run(move |event, _, control_flow| {
        *control_flow = ControlFlow::Wait;
        if let Event::WindowEvent {
            event: WindowEvent::CloseRequested,
            ..
        } = event
        {
            *control_flow = ControlFlow::Exit;
        }
    });
}
