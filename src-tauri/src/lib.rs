use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
use tauri_plugin_window_state::{AppHandleExt, StateFlags, WindowExt};

const WINDOW_STATE_FLAGS: StateFlags = StateFlags::POSITION
    .union(StateFlags::SIZE)
    .union(StateFlags::MAXIMIZED);

/// 已注册快捷键 -> 动作名 的映射
#[derive(Default)]
struct ShortcutMap(Mutex<HashMap<Shortcut, String>>);

#[derive(Default)]
struct GhostMode(AtomicBool);

#[tauri::command]
fn set_ghost_mode(app: AppHandle, enabled: bool) -> Result<(), String> {
    let win = app.get_webview_window("main").ok_or("阅读窗口不存在")?;
    let state = app.state::<GhostMode>();
    let previous = state.0.load(Ordering::Relaxed);
    let result = win
        .set_skip_taskbar(enabled)
        .and_then(|_| win.set_ignore_cursor_events(enabled));
    if let Err(error) = result {
        if let Err(rollback_error) = win.set_ignore_cursor_events(previous) {
            eprintln!("恢复鼠标穿透状态失败: {rollback_error}");
        }
        if let Err(rollback_error) = win.set_skip_taskbar(previous) {
            eprintln!("恢复任务栏图标失败: {rollback_error}");
        }
        return Err(error.to_string());
    }
    state.0.store(enabled, Ordering::Relaxed);
    Ok(())
}

/// 读取 txt 并自动检测编码(UTF-8/UTF-16 BOM、GBK/GB18030/Big5 等)
#[tauri::command]
fn read_book(path: String) -> Result<String, String> {
    let bytes = std::fs::read(&path).map_err(|e| format!("读取文件失败: {e}"))?;
    Ok(decode_text(&bytes))
}

fn decode_text(bytes: &[u8]) -> String {
    // BOM 优先
    if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) {
        return String::from_utf8_lossy(&bytes[3..]).into_owned();
    }
    if bytes.starts_with(&[0xFF, 0xFE]) {
        let (s, _, _) = encoding_rs::UTF_16LE.decode(bytes);
        return s.into_owned();
    }
    if bytes.starts_with(&[0xFE, 0xFF]) {
        let (s, _, _) = encoding_rs::UTF_16BE.decode(bytes);
        return s.into_owned();
    }
    // chardetng 自动检测(对 GBK/GB18030 中文文本效果好)
    let mut det = chardetng::EncodingDetector::new();
    det.feed(bytes, true);
    let enc = det.guess(None, true);
    let (s, _, _) = enc.decode(bytes);
    s.into_owned()
}

/// 弹出文件选择框,返回选中的 txt 路径列表
#[tauri::command]
async fn pick_txt(app: AppHandle) -> Vec<String> {
    use tauri_plugin_dialog::DialogExt;
    let files = app
        .dialog()
        .file()
        .add_filter("文本文件", &["txt", "TXT"])
        .blocking_pick_files();
    match files {
        Some(v) => v.into_iter().map(|f| f.to_string()).collect(),
        None => vec![],
    }
}

/// 持久化: 写入 appData/<name>.json
#[tauri::command]
fn save_data(app: AppHandle, name: String, data: String) -> Result<(), String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    std::fs::write(dir.join(format!("{name}.json")), data).map_err(|e| e.to_string())
}

/// 持久化: 读取 appData/<name>.json,不存在返回 "null"
#[tauri::command]
fn load_data(app: AppHandle, name: String) -> Result<String, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(std::fs::read_to_string(dir.join(format!("{name}.json"))).unwrap_or_else(|_| "null".into()))
}

/// 重新注册全部全局快捷键。
/// bindings: 动作名 -> 加速键字符串(空串表示禁用该动作)。
/// 返回: 动作名 -> "ok" / "disabled" / 错误信息,前端据此提示冲突。
#[tauri::command]
fn set_shortcuts(
    app: AppHandle,
    state: State<'_, ShortcutMap>,
    bindings: HashMap<String, String>,
) -> HashMap<String, String> {
    let gs = app.global_shortcut();
    let _ = gs.unregister_all();
    let mut map = state.0.lock().unwrap();
    map.clear();

    let mut results = HashMap::new();
    let visible = app
        .get_webview_window("main")
        .is_some_and(|win| win.is_visible().unwrap_or(false));
    for (action, acc) in bindings {
        let acc = acc.trim().to_string();
        if acc.is_empty() {
            results.insert(action, "disabled".to_string());
            continue;
        }
        match acc.parse::<Shortcut>() {
            Ok(sc) => match if action == "boss" || visible {
                gs.register(sc)
            } else {
                Ok(())
            } {
                Ok(()) => {
                    map.insert(sc, action.clone());
                    results.insert(action, "ok".to_string());
                }
                Err(e) => {
                    results.insert(action, format!("注册失败(可能被其他程序占用): {e}"));
                }
            },
            Err(e) => {
                results.insert(action, format!("无法解析快捷键: {e}"));
            }
        }
    }
    results
}

/// 隐藏时释放非老板键,唤回后恢复；不要持有映射锁调用系统快捷键 API。
fn sync_shortcuts(app: &AppHandle, visible: bool) {
    let shortcuts = app.state::<ShortcutMap>().0.lock().unwrap().clone();
    let gs = app.global_shortcut();
    for (shortcut, action) in shortcuts {
        if action == "boss" {
            continue;
        }
        let result = if visible && !gs.is_registered(shortcut) {
            gs.register(shortcut)
        } else if !visible && gs.is_registered(shortcut) {
            gs.unregister(shortcut)
        } else {
            continue;
        };
        if let Err(error) = result {
            let message = format!("快捷键 {action} 更新失败: {error}");
            eprintln!("{message}");
            let _ = app.emit("shortcut-error", message);
        }
    }
}

#[tauri::command]
fn hide_reader(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("main") {
        win.hide().map_err(|error| error.to_string())?;
        sync_shortcuts(&app, false);
    }
    Ok(())
}

/// 老板键: 直接在 Rust 侧切换窗口显示/隐藏,窗口隐藏时 JS 不可达也依然有效
fn toggle_boss(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        if win.is_visible().unwrap_or(false) {
            if let Err(error) = hide_reader(app.clone()) {
                eprintln!("隐藏窗口失败: {error}");
            }
        } else if win.show().is_ok() {
            // Windows 重新显示窗口时可能重新添加任务栏按钮。
            if app.state::<GhostMode>().0.load(Ordering::Relaxed) {
                if let Err(error) = win.set_skip_taskbar(true) {
                    eprintln!("隐藏任务栏图标失败: {error}");
                }
            }
            sync_shortcuts(app, true);
            let _ = win.set_focus();
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(WINDOW_STATE_FLAGS)
                .skip_initial_state("main")
                .build(),
        )
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state() != ShortcutState::Pressed {
                        return;
                    }
                    let action = {
                        let state = app.state::<ShortcutMap>();
                        let map = state.0.lock().unwrap();
                        map.get(shortcut).cloned()
                    };
                    if let Some(action) = action {
                        if action == "boss" {
                            toggle_boss(app);
                        } else if app
                            .get_webview_window("main")
                            .is_some_and(|win| win.is_visible().unwrap_or(false))
                        {
                            // 其余动作(翻页/穿透/置顶)交给前端处理
                            let _ = app.emit("hotkey", action);
                        }
                    }
                })
                .build(),
        )
        .manage(ShortcutMap::default())
        .manage(GhostMode::default())
        .setup(|app| {
            if let Some(win) = app.get_webview_window("main") {
                // 先恢复位置和尺寸再显示,避免启动时闪现默认窗口。
                if let Err(error) = win.restore_state(WINDOW_STATE_FLAGS) {
                    eprintln!("恢复窗口状态失败: {error}");
                }
                win.show()?;
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "main"
                && matches!(event, tauri::WindowEvent::CloseRequested { .. })
            {
                // 在窗口销毁前落盘;不保存隐藏状态,下次启动仍可直接看到窗口。
                if let Err(error) = window.app_handle().save_window_state(WINDOW_STATE_FLAGS) {
                    eprintln!("保存窗口状态失败: {error}");
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            read_book,
            pick_txt,
            save_data,
            load_data,
            set_shortcuts,
            hide_reader,
            set_ghost_mode
        ])
        .run(tauri::generate_context!())
        .expect("error while running FreeFish");
}
