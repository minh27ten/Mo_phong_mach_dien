#![windows_subsystem = "windows"]

use std::path::{Path, PathBuf};
#[cfg(target_os = "windows")]
use tao::platform::windows::WindowExtWindows;
use tao::{
    dpi::LogicalSize,
    event::{Event, WindowEvent},
    event_loop::{ControlFlow, EventLoop},
    window::{Icon, WindowBuilder},
};
use wry::{http::Response, WebContext, WebViewBuilder};

const INDEX_HTML: &[u8] = include_bytes!("../../dist-portable/index.html");

#[cfg(target_os = "windows")]
fn to_wide_null(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

#[cfg(target_os = "windows")]
fn prompt_save_file_dialog(hwnd: isize, default_path: &Path) -> Option<PathBuf> {
    #[repr(C)]
    #[allow(non_snake_case)]
    struct OpenFileNameW {
        lStructSize: u32,
        hwndOwner: isize,
        hInstance: isize,
        lpstrFilter: *const u16,
        lpstrCustomFilter: *mut u16,
        nMaxCustFilter: u32,
        nFilterIndex: u32,
        lpstrFile: *mut u16,
        nMaxFile: u32,
        lpstrFileTitle: *mut u16,
        nMaxFileTitle: u32,
        lpstrInitialDir: *const u16,
        lpstrTitle: *const u16,
        Flags: u32,
        nFileOffset: u16,
        nFileExtension: u16,
        lpstrDefExt: *const u16,
        lCustData: isize,
        lpfnHook: usize,
        lpTemplateName: *const u16,
        pvReserved: *mut core::ffi::c_void,
        dwReserved: u32,
        FlagsEx: u32,
    }

    #[link(name = "comdlg32")]
    extern "system" {
        fn GetSaveFileNameW(lpofn: *mut OpenFileNameW) -> i32;
    }

    const OFN_OVERWRITEPROMPT: u32 = 0x0000_0002;
    const OFN_NOCHANGEDIR: u32 = 0x0000_0008;
    const OFN_PATHMUSTEXIST: u32 = 0x0000_0800;
    const OFN_EXPLORER: u32 = 0x0008_0000;

    let filter: Vec<u16> = "Tệp mạch điện (*.json)\0*.json\0Tất cả tệp (*.*)\0*.*\0\0"
        .encode_utf16()
        .collect();
    let title = to_wide_null("Lưu sơ đồ mạch (JSON)");
    let def_ext = to_wide_null("json");
    let initial_dir = default_path
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .map(|p| to_wide_null(&p.to_string_lossy()));

    let mut file_buf = vec![0u16; 4096];
    let file_name = default_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("mach-dien.json");
    for (i, code) in file_name.encode_utf16().take(file_buf.len() - 1).enumerate() {
        file_buf[i] = code;
    }

    let mut ofn = OpenFileNameW {
        lStructSize: std::mem::size_of::<OpenFileNameW>() as u32,
        hwndOwner: hwnd,
        hInstance: 0,
        lpstrFilter: filter.as_ptr(),
        lpstrCustomFilter: std::ptr::null_mut(),
        nMaxCustFilter: 0,
        nFilterIndex: 1,
        lpstrFile: file_buf.as_mut_ptr(),
        nMaxFile: file_buf.len() as u32,
        lpstrFileTitle: std::ptr::null_mut(),
        nMaxFileTitle: 0,
        lpstrInitialDir: initial_dir
            .as_ref()
            .map_or(std::ptr::null(), |v| v.as_ptr()),
        lpstrTitle: title.as_ptr(),
        Flags: OFN_OVERWRITEPROMPT | OFN_PATHMUSTEXIST | OFN_NOCHANGEDIR | OFN_EXPLORER,
        nFileOffset: 0,
        nFileExtension: 0,
        lpstrDefExt: def_ext.as_ptr(),
        lCustData: 0,
        lpfnHook: 0,
        lpTemplateName: std::ptr::null(),
        pvReserved: std::ptr::null_mut(),
        dwReserved: 0,
        FlagsEx: 0,
    };

    let ok = unsafe { GetSaveFileNameW(&mut ofn) };
    if ok == 0 {
        return None;
    }
    let len = file_buf.iter().position(|&c| c == 0).unwrap_or(file_buf.len());
    let chosen = String::from_utf16_lossy(&file_buf[..len]);
    if chosen.is_empty() {
        None
    } else {
        Some(PathBuf::from(chosen))
    }
}

#[cfg(not(target_os = "windows"))]
fn prompt_save_file_dialog(_hwnd: isize, default_path: &Path) -> Option<PathBuf> {
    Some(default_path.to_path_buf())
}

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
    #[cfg(target_os = "windows")]
    let hwnd = window.hwnd();
    #[cfg(not(target_os = "windows"))]
    let hwnd: isize = 0;

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
        .with_initialization_script("window.__CIRCUITLAB_DESKTOP__ = true;")
        .with_url("machdienlab://localhost/")
        .with_focused(true)
        .with_download_started_handler(move |_url, path| {
            if let Some(chosen) = prompt_save_file_dialog(hwnd, path) {
                *path = chosen;
                true
            } else {
                false
            }
        })
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
