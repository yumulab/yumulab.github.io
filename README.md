# 湯村研究室 Web サイト

北海道情報大学 湯村研究室の Web サイトです。[Astro](https://astro.build/) で静的サイトを生成し、GitHub Pages で公開します。公開先は [www.yumulab.org](https://www.yumulab.org/) です。

Jekyll からの移行にあたり、既存記事の Markdown、フロントマター、ファイル名と公開 URL を維持しています。記事や固定ページは、引き続き元のファイルで編集できます。

## 開発

Node.js 24 と npm を使用します。

```sh
npm ci
npm run dev
```

開発サーバーの URL は起動時に表示されます（通常は `http://localhost:4321`）。

| コマンド | 内容 |
| --- | --- |
| `npm ci` | `package-lock.json` に従って依存関係をインストール |
| `npm run dev` | 開発サーバーを起動 |
| `npm run check` | Astro と TypeScript の検査 |
| `npm test` | 記事の読み込みと既存 URL の互換性を検証 |
| `npm run build` | 公開用ファイルを `dist/` に生成 |
| `npm run verify` | ビルド後のページ、リンク、既存コンテンツの互換性を検証 |
| `npm run preview` | `dist/` のビルド結果をローカルで確認 |

変更後は以下を実行します。

```sh
npm run check
npm test
npm run build
npm run verify
npm run preview
```

## 記事・ページの更新

お知らせは `_posts/YYYY-MM-DD-slug.md` を編集・追加します。既存のフロントマターと Markdown をそのまま使用します。

```md
---
layout: post
title: 記事のタイトル
categories: event
tags: [event]
---

記事の本文。

![写真](/assets/images/2026/example.jpg)
```

この記事を `_posts/2026-10-08-example.md` として保存すると、公開 URL は `/event/2026/10/08/example.html` になります。既存記事の URL を維持するため、公開済み記事のファイル名、日付、`categories`、`permalink` は変更しないでください。任意の `description` を指定すると、一覧の抜粋やページの説明に使用します。未指定の場合は本文から生成します。

`about.md`、`people.md`、`collaboration.md`、`yumura.md` などの固定ページ、および `research.html`、`publications.html` も元の場所で編集します。`index.md` のフロントマターはホームページに使用します。開発サーバーはこれらのコンテンツファイルの変更を監視し、ページを自動で再読み込みします。

既存記事の `{{ "/assets/images/example.jpg" | relative_url }}` も読み込み時に解釈します。引用符付きのパスに対する `relative_url` に対応しており、元の Markdown ファイルを書き換えません。新規の記事では `/assets/...` 形式のパスを直接使用できます。

トップページのサムネイルは、本文にある最初の画像を自動で使います。画像がない記事には共通のプレースホルダーを表示します。別の画像を使う場合だけ、フロントマターに `thumbnail: /assets/images/2026/example.jpg` を追加してください。

トップページのリンク先とラベルは `index.md` の2つのリンク一覧で管理します。`src/lib/home-links.ts` が一覧を読み込み、`src/components/HomeHero.astro` が研究室案内を動画上に、`src/components/SocialLinks.astro` が SNS・外部サービスを動画の下に表示します。`index.md` の紹介文はトップページには表示しません。リンクのデザインは各コンポーネントで編集できます。

画像などの静的ファイルは、従来どおりルートの `assets/` に置きます。準備スクリプトが開発・ビルド時に `public/` へコピーします。`public/` と `dist/` は生成物のため、直接編集しないでください。開発サーバー起動中に静的ファイルを変更した場合は、サーバーを再起動するとコピーが更新されます。

## トップページの動画

`src/components/HomeHero.astro` が、`assets/yumulab-top.mp4` を無音・ループで再生します。トップページのメニューバーは半透明の背景で動画上に重なります。`src/layouts/SiteLayout.astro` が `assets/images/yumulab-logo-transparent.png` をメニューバーの左端に表示し、トップページでは CSS で白く表示します。端末の「動きを減らす」設定が有効な場合は、動画を自動で読み込まず静止画を表示します。JavaScript が無効な場合や動画を再生できない場合も静止画を表示します。

SNS の SVG ロゴは [Simple Icons](https://github.com/simple-icons/simple-icons) の `icons/` から取得しています。保存先は `assets/images/social/` で、同フォルダの `LICENSE.txt` にライセンスを収録しています。

静止画は `assets/images/yumulab-top-poster.jpg` です。動画を差し替える際は、静止画も差し替えてください。FFmpeg が利用できる環境では、次のコマンドで生成できます（ビルド時に FFmpeg は不要です）。

```sh
ffmpeg -y -ss 0.7 -i assets/yumulab-top.mp4 -frames:v 1 -q:v 3 assets/images/yumulab-top-poster.jpg
```

## 実装と URL の互換性

サイト名や説明などの設定は `src/site.config.ts`、Astro のビルド設定は `astro.config.mjs` にあります。ページとレイアウトは `src/pages/`、`src/layouts/` で管理し、ナビゲーションは `src/layouts/SiteLayout.astro` で編集します。

記事は Jekyll と同じ `/:categories/:year/:month/:day/:title.html` の形式で生成し、固定ページの `.html` URL も維持します。互換性の基準となる既存記事のパス、URL、内容のハッシュは `tests/fixtures/legacy-content.json` に保存しています。通常のテストと CI は既存 URL を検証しつつ、記事本文の編集や新規記事の追加を許容します。

移行時点のソースファイルが一切変更されていないことを確認する場合のみ、ビルド後に次を実行します。この比較は移行確認用で、日常の記事更新時にハッシュの基準データを更新する必要はありません。

```sh
npm run verify -- --check-source-hashes
```

Jekyll 用の設定、テンプレート、Ruby 依存関係は削除済みです。レイアウトや機能の変更は Astro 側で行います。

## GitHub Pages への公開

`.github/workflows/deploy.yml` が `main` 向けの Pull Request と `main` への push を検証します。検査、テスト、ビルド、生成結果の検証が成功した `main` のみを GitHub Pages に公開します。Actions 画面から手動実行する場合も、公開対象は `main` に限定しています。

リポジトリの **Settings → Pages → Build and deployment → Source** は **GitHub Actions** に設定します。カスタムドメインは既存の `www.yumulab.org` を維持してください。ルートの `CNAME` が準備スクリプトによって `public/CNAME` にコピーされます。設定方法の詳細は [Astro の GitHub Pages 公開ガイド](https://docs.astro.build/en/guides/deploy/github/) を参照してください。

公開には GitHub Actions の `GITHUB_TOKEN` を使用します。従来の `GH_TOKEN` を使う Jekyll ワークフローと、`gh-pages` ブランチへのビルド結果の push は使用しません。ローカルでのビルドや `main` への merge だけでは、リモートの公開は実行されません。GitHub への push 後に Actions の実行結果を確認してください。

GitHub のデフォルトブランチと、Settings → Environments → `github-pages` のデプロイ許可ブランチも `main` に設定します。

## ライセンス

従来のテーマは [Jekyll YAT Theme](https://github.com/jeffreytse/jekyll-theme-yat) を使用しています。テーマ由来のコードのライセンスと著作権表示は [LICENSE.txt](LICENSE.txt) を参照してください。
