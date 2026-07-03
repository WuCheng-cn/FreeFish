# FreeFish 摸鱼阅读器

跨平台(Windows / macOS / Linux)悬浮桌面 txt 阅读器,基于 Tauri 2,包体小、内存低、进程不显眼。

## 功能

- 无边框半透明小窗,固定悬浮于所有窗口之上(可切换)
- 载入本地 txt,自动检测编码(UTF-8 / GBK / GB18030 / Big5 / UTF-16)
- 自动解析章节(支持自定义正则,识别失败自动按长度分段)
- 书架 + 阅读进度记忆(精确到章节内位置),记住窗口位置大小
- 全局快捷键:老板键一键显隐、翻页、鼠标穿透、切换置顶,全部可自定义,注册失败(被占用)会提示
- 目录面板:章节列表筛选 + 点击跳转
- 全文搜索:结果列表点击直达并高亮定位
- 鼠标穿透模式:只剩文字浮在屏幕上,点击穿透到下层窗口
- 伪装模式:正文渲染成代码注释样式
- 字体 / 字号 / 行距 / 文字颜色 / 背景颜色与透明度均可调

## 默认快捷键

| 动作 | 全局快捷键 | 说明 |
|---|---|---|
| 老板键(显/隐) | `Ctrl+Shift+H` | 隐藏后不在任务栏/Alt+Tab 出现,再按唤回 |
| 上一页 / 下一页 | `Ctrl+Alt+←` / `Ctrl+Alt+→` | 全局有效,可在设置中禁用 |
| 鼠标穿透 | `Ctrl+Shift+M` | 开启后只能用此键退出 |
| 切换置顶 | `Ctrl+Shift+T` | |

窗口聚焦时本地按键:`←/→`、`PgUp/PgDn`、`空格` 翻页;`↑/↓` 滚动;`Esc` 隐藏窗口(用老板键唤回);`Ctrl+F` 搜索。

所有全局快捷键在「设置」中点击输入框重新录制,按 `Backspace` 禁用,点「应用快捷键」生效;若与其他软件冲突会显示具体错误。

## 环境准备

1. **Node.js 18+**:https://nodejs.org
2. **Rust**:https://rustup.rs (Windows 选 MSVC 工具链,会提示安装 Visual Studio Build Tools)
3. 平台依赖:
   - Windows 10/11:WebView2 一般已内置,无需额外安装
   - macOS:`xcode-select --install`
   - Linux (Debian/Ubuntu):`sudo apt install libwebkit2gtk-4.1-dev build-essential libssl-dev libayatana-appindicator3-dev librsvg2-dev`

## 运行与打包

```bash
npm install
npm run dev      # 开发运行(首次编译约 5-10 分钟,之后增量很快)
npm run build    # 打包安装程序,产物在 src-tauri/target/release/bundle/
```

## 常见问题

- **打开是乱码**:极少数冷门编码可能识别失败,用记事本/VS Code 转存为 UTF-8 即可。
- **章节识别不准**:设置里改「章节标题正则」后点「重新解析」。默认规则匹配"第X章/回/节/卷/部/篇/集/话"及序章、楔子、番外等。
- **全局快捷键无效**:多半被其他软件占用,设置面板会显示注册失败的具体项,换个组合即可;安全软件拦截键盘钩子时请放行。
- **无法悬浮在游戏上**:独占全屏应用之上无法悬浮,是系统限制;游戏改用无边框窗口模式即可。
- **鼠标点不到窗口**:处于穿透模式,按穿透快捷键(默认 `Ctrl+Shift+M`)退出。
- **数据存哪了**:书架/进度/设置存在系统 appData 下的 `com.wu.freefish` 目录,书籍本体不复制、只记路径。

## 项目结构

```
src/            前端(原生 HTML/CSS/JS,无需打包器)
src-tauri/      Rust 后端:编码检测读取、全局快捷键、数据持久化、文件对话框
```
