# 借殼地貌：Rust 版

這是 `../shellscape/` 的原生 Rust 版本。原 JavaScript 程式保留。

## 執行

```sh
~/.cargo/bin/cargo run --locked
```

初次編譯需要下載依賴，之後可用 `cargo run --locked --offline`。直接開啟桌面 `借殼地貌-Rust/借殼地貌 Rust.app` 可執行已編譯的模型視窗。

拖曳旋轉、滾輪縮放、右鍵平移。右側可調整搬運、靜止、碎片回收、外殼開合、速度、雨季、光線、自動環視與暫停。模型圖片與 GLB 存桌面 `借殼地貌-Rust/`。

只匯出模型、不開啟視窗：

```sh
~/.cargo/bin/cargo run --locked -- --export shellscape.glb
~/.cargo/bin/cargo run --locked -- --export shellscape-open.glb --open-shell
```

## 轉換範圍

- Rust 以 `three-d 0.18.2` 進行原生 OpenGL 渲染，`egui 0.29.1` 取代網頁 Tweakpane。
- `assets/shellscape.glb` 沿用目前生物的既有網格與貼圖，避免重新生成使外形變樣。GLB 是模型資料，不是 JavaScript。
- 動作、時間、開殼、牽引絲頂點更新、模型載入／匯出與 UI 均由 Rust 實作。沒有 WebView 或背景 JS。
- GLB 匯出包含目前姿態、更新後的牽引絲及原始貼圖。不含操作 UI、展示台、雨滴或烘焙動畫。
- 依 Luna 指示不加入影片錄製。
- 原生渲染器與 Three.js 的光照、透明和色調映射不同，畫面不保證逐像素一致。原版有的網頁霧效果未移植，展示台簡化；既有核心生物資產保留。
- 這次是程式與動作移植，沒有把原本的程序建模生成器重寫成 Rust，也沒有新增生物設定。

## 程式怎麼分

1. `src/asset.rs`：讀取內嵌的 GLB、辨認外殼與內膜、保存原始貼圖，匯出目前姿態。
2. `src/motion.rs`：管理動作時間，計算每片殼的位置、內膜收縮與 52 條牽引絲的頂點。暫停時時間停止。
3. `src/main.rs`：開啟視窗、顯示模型與控制面板，處理滑鼠、光線、GLB／圖片保存。

若要改行為，先調 `motion.rs` 的軌跡；若要改外觀，要修改模型資產。上面寫的是模型目前如何運作，不是已驗證的生理機制。

## 開源工具選擇

- [three-d](https://github.com/asny/three-d)：MIT，Rust 原生 3D 與 egui 整合，適合目前一隻模型的觀察器。固定 0.18.2。
- [egui](https://github.com/emilk/egui)：MIT/Apache-2.0，提供 Rust 控制面板，無需網頁。
- [three-d-asset](https://github.com/asny/three-d-asset)：MIT，讀取 GLB 與 PNG，固定與 three-d 相容的 0.9.2。
- [Bevy](https://bevy.org/learn/quick-start/getting-started/)：適合更大的場景與遊戲系統，但此輪不需要完整遊戲引擎，未採用。
- 中文字型執行時讀 macOS 系統黑體，未把 Apple 字型複製進 repo。

## 檢查

```sh
~/.cargo/bin/cargo check --locked
~/.cargo/bin/cargo test --locked
```

模型與動作仍是科幻展示軌跡，非碰撞／生理模擬。請實際操作確認是否符合 Luna 的想像。

## AI 揭露

- 工具：Codex。
- 日期：2026-10-15。
- Prompt 摘要：把目前借殼地貌程式轉為 Rust，只要模型，不再製作影片。
- 採用範圍：研究 Rust 渲染工具、Rust 視窗／動作／匯出程式、保留原有 GLB 資產與文件。未代寫本人反思或創作理由。

## 2026-10-16 保存狀態

- 已通過 `cargo check --locked`、`cargo build --locked`、`cargo fmt --check`、`cargo test --locked`（3 項），並以 CLI 輸出一般／開殼姿態 GLB。
- 原生 App 成功顯示模型與中文面板。自動操作工具點擊時回報 noWindowsAvailable，因此面板按鈕尚未完整實測，需手動確認。
- 新版原始碼與 GLB 資產保存至 repo；桌面 App 與編譯快取留在本機。
- AI：Codex，2026-10-16；依 Luna 要求整理並上傳進度，未代寫反思。
