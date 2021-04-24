<div align="center" style="vertical-align: center;">
  <img src="https://cdn.rpaka.dev/logo/slack.svg" height="80px" style="margin-right: 15px;" />
  <img src="https://cdn.rpaka.dev/icon/pakabot.png" height="80px" style="margin-right: 15px;" />
  <img src="https://cdn.rpaka.dev/icon/mst-attget.png" height="80px" />
  <h1>MSTeamsAttendanceGetBot</h1>
  <h1>MSTeams出欠自動取得bot</h1>
  <img src="https://cdn.rpaka.dev/logo/nodejs.svg" height="80px" style="margin-right: 15px;" />
  <img src="https://cdn.rpaka.dev/logo/puppeteer.svg" height="80px" />
</div><br />

![動作イメージ](https://cdn.rpaka.dev/useimage/mst-attget/slack.png)

## 概要

MSTeamsの特定のチャンネルで行われている会議の参加者を取得して、出欠をSlackに通知するという物です。Excelファイルへの記録を行う機能も搭載していますが、技術的な理由により現在は動作しません。

## 背景

研究室で行う会議や輪講などが例の感染症の影響でオンラインのMSTeams会議に移行したので、出欠記録係（私）が楽できるように作りました。あと出席忘れ防止にもなりますしね。

本当はMSTeamsのAPIを使いたかったのですが、大学により利用が禁じられてる（そりゃそうか）ので、ブラウザのMSTeamsクライアントを操作して取得させるようにしています。

## 利用

一般の利用は想定してないですが、頑張れば動きます。私はLambdaで動かしてますが、その場合メモリと実行時間がデフォルトだと全く足りないので注意してください。

## 構成

![](https://cdn.rpaka.dev/arch/mst-attget.jpg)

## 機能
- MSTeamsブラウザクライアントによる出席者取得（APIアクセス不要）
- 出欠をSlackに通知
- ~~出欠記録ファイルを更新~~（そのうち復活させます）

## 動作環境
- Node.js（検証：v13.13.0）

## 利用ライブラリ
- @slack/web-api
- aws-sdk
- chrome-aws-lambda
- dotenv
- puppeteer-core
- xlsx-populate
