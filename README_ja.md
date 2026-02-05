# Ronginus - Obsidian用AIディベートプラグイン

Ronginusは、複数のAI CLIツール（Gemini CLI、Claude Code、Codex CLI）間で構造化されたディベートを可能にするObsidianプラグインです。AIは与えられたテーマについて並列で議論し、ターンごとに視点を共有し、投票で最良の結論を決定します。

![新規ディベート](new.png)

## 機能

- **並列AIディベート**: 複数のAIアシスタント（Gemini、Claude、Codex）がトピックを同時に議論
- **ターン制の議論**: 設定可能なターン数（デフォルト: 2回）で、AIが互いの視点を共有し応答
- **投票システム**: 各AIが最良の結論に投票（自分自身への投票も可能）。同票の場合は「引き分け」として全員を表示
- **自動ノートエクスポート**: 完全なディベートの議事録をMarkdownノートとして保存
- **i18n対応**: 英語と日本語をサポート（Obsidianのロケールから自動検出）

## 必要条件

3つのCLIツールのうち**少なくとも2つ**がインストールされ、認証されている必要があります：

### Gemini CLI
```bash
npm install -g @google/gemini-cli
gemini auth login
```

### Claude Code CLI
```bash
npm install -g @anthropic-ai/claude-code
claude login
```

### Codex CLI
```bash
npm install -g @openai/codex
# OPENAI_API_KEY環境変数を設定
```

## インストール

### 手動インストール
1. 最新リリースから`main.js`、`manifest.json`、`styles.css`をダウンロード
2. Vaultの`.obsidian/plugins/`ディレクトリに`ronginus`フォルダを作成
3. ダウンロードしたファイルをフォルダにコピー
4. Obsidianの設定 > コミュニティプラグインでプラグインを有効化

### ソースからビルド
```bash
git clone https://github.com/takeshy/obsidian-ronginus
cd obsidian-ronginus
npm install
npm run build
```

## 使い方

### 1. CLIツールの認証
1. Obsidian設定 > Ronginusを開く
2. インストール済みの各CLIの「認証」をクリック
3. 少なくとも2つのCLIが「認証済み」ステータスになっていることを確認

![設定 - CLIプロバイダー](setting1.png)

### 2. ディベートの開始
1. リボンのディベートアイコンをクリック、またはコマンドパレットで「Open AI Debate」を実行
2. ディベートのテーマ/トピックを入力
3. ターン数を設定（1-10）
4. 「ディベート開始」をクリック

### 3. ディベートの観察
- 各AIがテーマについて並列で思考します
- 各ターン後、AIは互いの応答を確認し、議論を続けます
- 最終ターンで、各AIが結論を提示します
- その後、AIが最良の結論に投票します

![ディベート進行中](start_debate.png)

![投票結果](vote_and_conclusion.png)

### 4. 結果の保存
- 「ノートに保存」をクリックして、ディベート全体をMarkdownファイルとしてエクスポート
- ノートは設定された出力フォルダに保存されます（デフォルト: "Debates"）

## 設定

| 設定 | 説明 |
|------|------|
| 出力フォルダ | ディベートノートを保存するフォルダ（デフォルト: "Debates"） |
| システムプロンプト | すべてのAI参加者に与える指示 |
| 結論プロンプト | 最終結論フェーズ用のプロンプト |
| 投票プロンプト | 投票フェーズ用のプロンプト |

![設定 - プロンプト](setting2.png)

## 仕組み

```
テーマ入力
    ↓
┌─────────────────────────────────────┐
│         ターン 1（並列）             │
│  Gemini ──┬── Claude ──┬── Codex    │
│           │            │            │
│     回答 1        回答 1            │
└─────────────────────────────────────┘
    ↓ （回答を共有）
┌─────────────────────────────────────┐
│         ターン 2（並列）             │
│  各AIが他のAIの回答を見て           │
│  洗練された考えを提供               │
└─────────────────────────────────────┘
    ↓ （最終ターン）
┌─────────────────────────────────────┐
│         結論フェーズ                 │
│  各AIが最終結論を提示               │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│         投票フェーズ                 │
│  各AIが最良の結論に投票             │
│  （自分または他者に投票可能）        │
└─────────────────────────────────────┘
    ↓
勝者発表（多数決）
または引き分け（同票の場合）
```

## ライセンス

MIT License

## クレジット

- [Obsidian Plugin API](https://github.com/obsidianmd/obsidian-api)を使用して構築
- [Gemini CLI](https://github.com/google/gemini-cli)、[Claude Code](https://github.com/anthropics/claude-code)、[Codex CLI](https://github.com/openai/codex)を使用
