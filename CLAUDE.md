# CLAUDE.md

Pirafu2411 Playground は、個人制作のWebアプリ・ミニゲーム・ツールを紹介する静的Portalである。本番は https://pirafu2411.pages.dev 。作品本体はそれぞれ独立したリポジトリとCloudflare Pagesで公開し、このPortalは作品の掲載情報だけを持つ。掲載情報の生成と登録PRの作成は、別リポジトリの pirafu CLI（Termnix-IT/pirafu-cli）が担う。

設計の判断理由、データ契約、CLIの仕様、公開の手順は [docs/設計と実装計画.md](docs/設計と実装計画.md) にまとまっている。このファイルには、作業のたびに必要な要点だけを書く。

## コマンド

```powershell
npm run dev            # カタログを生成して開発サーバーを起動（作品JSONや画像を変えたら再起動する）
npm run verify         # Lint → 型検査 → 単体・UIテスト → 本番ビルド → 配信物検査
npm run test:e2e       # ビルド済みdistをChromiumで操作確認（先にverifyかbuildを実行する）
npm run browser:install  # e2e用Chromiumの導入（npm ci後は入れ直す）
npm run catalog:check  # 作品レコードと画像だけを検査
```

内蔵ブラウザで確認するときは、`.claude/launch.json` の `portal-dev`（port 5173）を `preview_start` で起動する。ブラウザペインが非表示のままだと描画が止まり、View Transitionsやアニメーションが完了しない。動きを確認するときはペインを表示する。

## 構成

- `src/features/catalog/`：検索・絞り込み・並べ替え・関連作品を返す純粋関数。表示から独立させ、`tests/catalog-selectors.test.ts`で検査する。
- `src/pages/`・`src/components/`・`src/styles/base.css`：画面。配色・余白・角丸は`base.css`冒頭のCSS変数にまとめている。
- `src/data/catalog.ts`：生成済みカタログ（`src/data/generated/`）を読む境界。生成物は手で編集もcommitもしない。
- `src/data/changelog.ts`：「このサイトについて」に出す更新履歴。新しい順に手書きする。
- `catalog/`：作品レコード（`projects/<id>.json`）と元画像（`media/<id>/`）。`contracts/v1/`のJSON Schemaで検証する。
- `scripts/verify-dist.mjs`：配信物を許可リストで検査する。非掲載作品の文字列や停止中のURLが配信物に紛れ込んでいないかも確かめる。
- `public/`：`_headers`（CSPなど）、ファビコン、ホーム画面用アイコン、OGP画像、テーマの初期化スクリプト（`theme.js`）だけを置く固定ファイル。

## 作品の掲載と更新

- 実作品のレコードは`catalog/projects/`を直接編集しない。作品側の`pirafu.yaml`を原本として、`/pirafu-publisher` Skill（pirafu CLIの`register --update`）で登録・更新PRを作る。直接編集すると、作品側の原本とPortalの内容がずれる。
- CLIの登録ブランチ（`pirafu/register/<作品ID>`）は、CLI以外の方法で更新しない。`gh pr update-branch`などでCLI以外のコミットが入ると、CLIは次の登録更新を終了コード7で止める。登録PRがBEHINDにならないよう、登録PRはほかのPRより先にmergeされる順番にする。止まった場合は、そのブランチに未mergeの登録が残っていないことを確かめ、利用者の承認を得てリモートブランチを削除してから、CLIで計画し直す。
- 構成サンプル（`sample-*`）は一覧に出さない。Webアプリとツールのサンプルはhidden、showcase表示を確かめる`sample-unlisted`は一覧外（unlisted）にしている。e2eテストは実作品DOPASWEEPERと`sample-unlisted`を使うので、これらの掲載状態を変えたらe2eも直す。
- 作品の掲載・更新やサイトの目に見える変更をしたら、`src/data/changelog.ts`に1行足す。文面は「デザインをリニューアル」「DOPASWEEPERを追加」のような短い書き方にそろえる。日付順と作品IDの実在はテストで検査される。
- サイトの文章は、個人のサイトらしい素直なです・ます調で書く。「制作拠点」「紹介します」「一新しました」のような硬い言い回しや、見る人に関係ない仕組みの説明は入れない。

## 画面の約束事

- アクセシビリティ：本物のリンクとボタンを使い、クリック可能なdivを作らない。開発状況などの状態は、色だけでなく記号や文字でも示す。ホバーだけで成り立つ操作を作らない。
- ヘッダーのメニューは、選択状態で文字の太さを変えない。太さが変わると幅が変わり、切り替えのたびに文字がずれる。
- 演出はReact 19の`<ViewTransition>`で付けている。これは`BrowserRouter`がURL更新を`startTransition`で反映することを前提にしているので、`useTransitions={false}`を指定しない。`prefers-reduced-motion`ではCSSで動きを止める。
- CSPは`script-src`・`style-src`・`img-src`とも`'self'`だけを許可している。外部CDN・外部画像・外部のWebフォント配信は使わない。フォントはFontsourceのnpmパッケージで同梱している（`src/main.tsx`）。CSSの`data:`画像もCSPで止まる。Reactの`style`プロップ（CSSOM経由）は使えるが、HTMLの`style`属性は使えない。
- 配色はライト・ダークの2テーマで、`<html data-theme>`と`base.css`冒頭のテーマ別CSS変数で切り替える。色は変数で書き、固定の色を直接書かない。どちらのテーマでも文字のコントラストを確かめる（白地のアンバー文字には`--accent-text`を使う）。テーマの初期化は`public/theme.js`（描画前に実行）と`src/app/theme.ts`が同じキー`pirafu-theme`を使う。作品画像を見せるタイルは`.dark-scope`で常に暗くする。
- `public/`へファイルを足すときは、`scripts/verify-dist.mjs`の許可リストも更新する。更新しないとビルドの検査で落ちる。
- OGPはサイト全体で共通にしている。`og:url`と`og:image`は本番の絶対URLなので、ドメインを変えるときは`index.html`も直す。

## Git・PR

- mainは保護されている。PRを作り、必須チェック Verify（ubuntu-latest / windows-latest）を通し、squashでmergeする。mainはbaseに追いついている必要がある（strict）。
- mainへのmergeが承認されたPRは、作成直後に`gh pr merge <番号> --squash --auto --match-head-commit <SHA>`で自動mergeを予約する。CIの完了は待たない（ポーリングしない）。
- 同じbaseから作った複数のPRは、1つがmergeされると残りがBEHINDになる。`gh pr update-branch`で追従させたら、新しい先頭コミットで自動mergeを予約し直す。
- mainへのmergeはCloudflare Pagesの本番公開につながる。`docs/`だけの変更はPagesのビルド対象から外している。
