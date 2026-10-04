# かんたん請求書（shokunin-invoice）

Antigravity(AG)から Claude Code(CC)へ引き継ぎ済み。今後の開発はCCで行う。仕様の概要は `README.md`。

- 構成: TypeScriptサーバー（`src/`）、Vercel用エントリ（`api/index.js`）、DB移行（`migrations/`、`run_migrations.mjs`）。
- 開発: `npm run dev` / ビルド: `npm run build`。作業完了前にビルドを通す。
- 環境変数（値はリポジトリに置かない）: `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `BLOB_READ_WRITE_TOKEN`。
- DBスキーマ変更は `migrations/` に追加する形で行い、本番DBへの適用は確認してから。
- 作業ブランチで変更し、PRで反映する。事実は検証してから報告する。
- 開発アイデア: ユーザーが新機能・改善のアイデアを話したら、`.claude/agents/dev-employee.md` の「ホーム」の節に従い、ホームのダッシュボード（https://claude.ai/artifact/9eu8jRktA8nGCC8HKN7L8A）の `ideas` に保存する（実装は依頼があるまでしない）。
