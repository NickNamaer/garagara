# ガラガラ抽選（色玉）React

PC ブラウザで動く、色付きの玉が出るガラガラ抽選 Web アプリ（React + Vite + Tailwind）。
- 複数回まとめて抽選、重複なし、在庫（数）・重み（確率）設定
- 設定の一括入力（リスト／HEX列／等配色生成）
- 結果 CSV 出力、設定 JSON 入出力

## 使い方
```bash
npm install
npm run dev
# ブラウザで http://localhost:5173/
```

本番ビルド：
```bash
npm run build
npm run preview
```

## 注意
- Tailwind を含めているため、初回は依存をインストールしてください。
- 画面投影用途ではブラウザを全画面(F11)にするのがおすすめです。
