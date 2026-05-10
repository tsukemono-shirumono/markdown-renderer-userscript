# AGENTS.md

## プロジェクト情報
- リモートリポジトリ: https://github.com/tsukemono-shirumono/markdown-renderer-userscript.git

## 開発環境
- 言語: JavaScript (Userscript)
- 主要ファイル:
  - `mdrenderer.user.js` — デスクトップブラウザ版（Firefox / Chrome + Tampermonkey 等）
  - `mdrenderer-safari.user.js` — Safari / iPad 版（Userscripts 拡張用）

## プラットフォーム別の画像処理
- **デスクトップ版**: GM_xmlhttpRequest で画像を取得し blob URL / canvas で表示（CSP 回避対応）
- **Safari 版**: `<img src="元URL">` で直接表示。GM_xmlhttpRequest は使わない
  - Safari の Userscripts 拡張では `GM_xmlhttpRequest` の `responseType: blob/arraybuffer` 指定時にコールバックがサイレントフェイルする既知問題がある
