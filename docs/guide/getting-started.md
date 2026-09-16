# 安装与快速开始

## 安装

1. 打开 [最新 Release](https://github.com/WuCheng-cn/FreeFish/releases/latest)。
2. 下载适合系统的安装包：Windows 选 `.exe`，macOS 选 `.dmg`，Linux 优先选 `.AppImage` 或 `.deb`。
3. 完成安装并启动 **SysNotes**。FreeFish 使用这个名称作为进程与窗口伪装。

应用需要系统自带的 WebView。Windows 10/11 通常已安装 WebView2；若启动时报缺失，请安装微软提供的 WebView2 Runtime。

## 第一次阅读

1. 打开书架，点击 **+ 添加 txt**。
2. 选择本地 TXT 文件。书籍不会被复制或上传。
3. FreeFish 会自动识别编码并解析章节；点击书籍即可继续阅读。
4. 使用 `Ctrl+Shift+H` 隐藏或唤回窗口。

## 数据位置

书架、阅读进度和设置保存在系统 appData 下的 `com.wu.freefish` 目录。书籍本体仍留在原位置，因此移动或删除源文件后需要重新添加。

## 从源码运行

需要 Node.js 18+、Rust 和对应平台的 Tauri 依赖：

```bash
npm install
npm run dev
```

打包安装程序：

```bash
npm run build
```

产物位于 `src-tauri/target/release/bundle/`。
