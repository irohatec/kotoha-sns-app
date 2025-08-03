import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import bodyParser from "body-parser";
import { GoogleGenerativeAI } from "@google/generative-ai";

// 環境変数を読み込む
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// CORSとJSONパーサーを有効にする
app.use(cors());
app.use(bodyParser.json());

// Gemini APIのクライアントを初期化
// APIキーは環境変数から取得する
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * Geminiへの指示（プロンプト）テンプレート。
 * SNSテンプレート.txtの内容を基に、より詳細な指示を追加。
 */
const promptTemplate = `
# 指示書

あなたは、プロのSNSマーケティング担当者です。
以下の【制約条件】と【入力情報】を厳守し、【出力フォーマット】に従って、各SNSプラットフォームに最適化された投稿コンテンツを生成してください。

---

## 【制約条件】

* **全般:**
    * キャプションの文字数制限とハッシュタグ数は厳守すること。
    * 文字数は全角、半角、改行もすべて1文字としてカウントすること。
    * キャプション本文とハッシュタグは、必ず改行で分けること。
    * ハッシュタグは、ビッグワード、スモールワード、オリジナルワードをバランス良く組み合わせること。
    * 各フォーマットにおいて、冒頭や誘導文に1〜2個の絵文字を効果的に活用し、視覚的な魅力を高めること。
    * Instagram（リール・ストーリーズ・フィード）の投稿本文には、ウェブサイトURLを直接記載しないこと。
    * 文章は読みやすさを重視し、適度に改行を入れること。
    * 生成する内容は、【入力情報】のターゲット層に響くような言葉遣いやトーン＆マナーを意識すること。

* **各SNSの詳細ルール:**
    1.  **Instagramリール:**
        * キャプション本文: 60〜100文字
        * ハッシュタグ: 5個
        * 内容: 視聴を促す、シンプルで短い文章が効果的。
    2.  **Instagramストーリーズ:**
        * **キャプション短文:**
            * 文字数: 10〜60文字
            * ハッシュタグ: 3個
            * 内容: 1フレーズで伝え、短く目立つ言葉を選ぶ。
        * **構成案（字幕＋CTA）:**
            * 内容: ストーリーズ動画のフレームごとの字幕とCTAの構成案を提示。ハッシュタグは不要。
    3.  **Instagramフィード:**
        * **キャプション短文:**
            * 文字数: 125〜150文字
            * ハッシュタグ: 5個
            * 内容: 最初の2〜3行で興味を引き、「もっと見る」を押させる工夫をする。
        * **構成案（カルーセル形式）:**
            * 内容: 5〜6枚のカルーセル投稿を想定した各画像の文案とCTAを提示。
    4.  **Facebook:**
        * キャプション本文: 150〜200文字
        * ハッシュタグ: 5個
        * 内容: 「共感」や「実体験」を盛り込んだ中〜短文が好まれる。
    5.  **LinkedIn:**
        * キャプション本文: 200〜300文字
        * ハッシュタグ: 5個
        * 内容: ビジネス文脈に合わせ、専門性や信頼性が伝わるように。冒頭2行が重要。
    6.  **X (旧Twitter):**
        * キャプション本文: 80〜150文字
        * ハッシュタグ: 3個
        * 内容: 短く、強い主張や結論を簡潔に述べる。
    7.  **Threads:**
        * キャプション本文: 80〜150文字
        * ハッシュタグ: 3個
        * 内容: Xに似ているが、よりシンプルで共感性のある一言が好まれる。エリア情報も意識する。
    8.  **Spotify:**
        * キャプション本文: 100〜200文字
        * ハッシュタグ: 不要
        * 内容: 検索を意識し、エピソードの内容が明快に伝わる導入にする。
    9.  **リール動画のセリフ構成:**
        * 目的: 約30秒のリール動画用の台本を作成。
        * 形式: **話者1（視聴者に近い立場）**と**話者2（気づきを与える立場）**の掛け合い形式。
        * 構成: 【導入】→【気づき】→【効果】→【誘導(CTA)】の流れを意識する。
        * セリフ量: **話者1と話者2が交互に3回ずつ、合計6つのセリフ**で構成すること。各セリフは1〜2行に収める。
        * タイトル: 動画の冒頭で惹きつけるキャッチーなフレーズを考える。

---

## 【入力情報】

* **会社名/個人名:** {{company}}
* **投稿テーマ:** {{theme}}
* **SNSターゲット層:** {{target}}
* **ウェブサイトURL:** {{url}}
* **CTA（行動を促す一言）:** {{cta}}
* **エリア:** {{area}}

---

## 【出力フォーマット】

* 以下のJSON構造を厳密に守り、JSONオブジェクトのみを出力すること。
* 解説や前置き、\`\`\`のようなマークダウン記法は一切含めないこと。

{
  "instagram_reel": { "caption": "..." },
  "instagram_stories": { "caption": "...", "structure": "..." },
  "instagram_feed": { "caption": "...", "structure": "..." },
  "facebook": { "caption": "..." },
  "linkedin": { "caption": "..." },
  "x": { "caption": "..." },
  "threads": { "caption": "..." },
  "spotify": { "caption": "..." },
  "reel_script": {
    "title": "...",
    "script": [
      { "speaker": "話者1", "dialogue": "..." },
      { "speaker": "話者2", "dialogue": "..." },
      { "speaker": "話者1", "dialogue": "..." },
      { "speaker": "話者2", "dialogue": "..." },
      { "speaker": "話者1", "dialogue": "..." },
      { "speaker": "話者2", "dialogue": "..." }
    ]
  }
}
`;

/**
 * リトライ機能付きでGemini APIを呼び出す関数
 * @param {object} model - Geminiモデルインスタンス
 * @param {string} prompt - モデルに送信するプロンプト
 * @param {number} maxRetries - 最大リトライ回数
 * @returns {Promise<object>} - APIからの生成結果
 */
async function generateContentWithRetry(model, prompt, maxRetries = 3) {
    let attempt = 0;
    while (attempt < maxRetries) {
        try {
            const result = await model.generateContent(prompt);
            return result; // 成功した場合は結果を返す
        } catch (error) {
            attempt++;
            // サーバー過負荷エラーの場合のみリトライ
            if (error.message && (error.message.includes('503') || error.message.includes('overloaded'))) {
                 if (attempt >= maxRetries) {
                    console.error(`Final attempt failed. Error: ${error.message}`);
                    throw new Error(`AIモデルが現在高負荷です。しばらくしてからもう一度お試しください。(Model is overloaded)`);
                }
                const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
                console.log(`AI model overloaded. Retrying in ${delay / 1000}s... (Attempt ${attempt}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                // その他のエラーは即座にスロー
                console.error(`An unexpected error occurred: ${error.message}`);
                throw error;
            }
        }
    }
}

// ルートURLへのGETリクエスト（サーバーの稼働確認用）
app.get("/", (req, res) => {
  res.status(200).json({ 
    status: "ok", 
    message: "kotoha sns app API is running." 
  });
});

// SNS投稿を生成するエンドポイント
app.post("/generate-sns", async (req, res) => {
  try {
    // リクエストボディからユーザーの入力を取得
    const { company, theme, cta, target, url, area } = req.body;

    // 必須項目をチェック
    if (!company || !theme) {
      return res.status(400).json({ error: "会社名と投稿テーマは必須です。" });
    }

    // プロンプトテンプレートに入力情報を埋め込む
    let filledPrompt = promptTemplate
      .replace('{{company}}', company)
      .replace('{{theme}}', theme)
      .replace('{{target}}', target || '指定なし')
      .replace('{{url}}', url || '指定なし')
      .replace('{{cta}}', cta || '指定なし')
      .replace('{{area}}', area || '指定なし');

    // Geminiモデルを取得
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    
    // プロンプトを送信してコンテンツを生成
    const result = await generateContentWithRetry(model, filledPrompt);
    const response = await result.response;

    // レスポンスの安全性をチェック
    if (!response.candidates || response.candidates.length === 0 || !response.text()) {
        const blockReason = response.promptFeedback ? response.promptFeedback.blockReason : '不明な理由';
        console.error(`AI response blocked or empty. Reason: ${blockReason}`);
        return res.status(500).json({ error: `AIが応答を生成できませんでした。入力内容がセーフティポリシーに抵触した可能性があります。理由: ${blockReason}` });
    }

    const text = response.text();

    // AIの応答からJSON部分を抽出してパースする
    try {
        // 応答テキストからJSONオブジェクトを安全に抽出
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const jsonString = jsonMatch[0];
            let jsonResponse = JSON.parse(jsonString);

            // ユーザーからURLが提供された場合、プレースホルダーを置換
            // AIにはURLを直接生成させず、安全のためにサーバー側で置換する
            if (url) {
                for (const key in jsonResponse) {
                    if (jsonResponse[key] && jsonResponse[key].caption) {
                        jsonResponse[key].caption = jsonResponse[key].caption.replace(/\[ウェブサイトURL\]/g, url).replace(/\[ウェブサイトのURL\]/g, url);
                    }
                    if (jsonResponse[key] && jsonResponse[key].structure) {
                         jsonResponse[key].structure = jsonResponse[key].structure.replace(/\[ウェブサイトURL\]/g, url).replace(/\[ウェブサイトのURL\]/g, url);
                    }
                }
            }

            // 整形したJSONをクライアントに返す
            res.json(jsonResponse);
        } else {
            console.error("AI response did not contain valid JSON:", text);
            throw new Error("AIの応答にJSONが含まれていません。");
        }
    } catch (parseError) {
        console.error("Failed to parse JSON from AI response:", text, parseError);
        res.status(500).json({ error: "AIからの応答をJSONとして解析できませんでした。AIの出力形式が不正な可能性があります。" });
    }

  } catch (err) {
    console.error("An unexpected error occurred in the generation process:", err);
    res.status(500).json({ error: `サーバーエラーが発生しました: ${err.message}` });
  }
});

// サーバーを指定されたポートで起動
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
