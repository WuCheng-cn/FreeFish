use std::collections::HashMap;
use std::sync::Mutex;

use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

/// 已注册快捷键 -> 动作名 的映射
#[derive(Default)]
struct ShortcutMap(Mutex<HashMap<Shortcut, String>>);

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
    for (action, acc) in bindings {
        let acc = acc.trim().to_string();
        if acc.is_empty() {
            results.insert(action, "disabled".to_string());
            continue;
        }
        match acc.parse::<Shortcut>() {
            Ok(sc) => match gs.register(sc) {
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

/// 老板键: 直接在 Rust 侧切换窗口显示/隐藏,窗口隐藏时 JS 不可达也依然有效
fn toggle_boss(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        if win.is_visible().unwrap_or(false) {
            let _ = win.hide();
        } else {
            let _ = win.show();
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
                .with_state_flags(
                    tauri_plugin_window_state::StateFlags::POSITION
                        | tauri_plugin_window_state::StateFlags::SIZE,
                )
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
                        } else {
                            // 其余动作(翻页/穿透/置顶)交给前端处理
                            let _ = app.emit("hotkey", action);
                        }
                    }
                })
                .build(),
        )
        .manage(ShortcutMap::default())
        .invoke_handler(tauri::generate_handler![
            read_book,
            pick_txt,
            save_data,
            load_data,
            set_shortcuts
        ])
        .run(tauri::generate_context!())
        .expect("error while running FreeFish");
}
