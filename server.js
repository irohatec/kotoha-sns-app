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
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * Geminiへの指示（プロンプト）テンプレート。
 */
const promptTemplate = `
# 指示書

あなたは、非常に優秀なSNSマーケティング担当者です。
以下の【制約条件】と【入力情報】を厳守し、【出力フォーマット】で定義されたJSON構造に完全に従って、各SNSプラットフォームに最適化された投稿コンテンツを生成してください。
解説や前置き、マークダウン記法は一切含めず、有効なJSONオブジェクトのみを出力してください。

---

## 【制約条件】

* **全般:**
    * キャプションの文字数制限とハッシュタグ数は厳守すること。
    * 文字数は全角、半角、改行もすべて1文字としてカウントすること。
    * キャプション本文とハッシュタグは、必ず改行で分けること。
    * ハッシュタグは、ビッグワード、スモールワード、オリジナルワードをバランス良く組み合わせること。
    * Instagram（リール・ストーリーズ・フィード）の投稿本文には、ウェブサイトURLを直接記載しないこと。
    * 文章は読みやすさを重視し、適度に改行を入れること。
    * 生成する内容は、【入力情報】のターゲット層に響くような言葉遣いやトーン＆マナーを意識すること。

* **★★★ 絵文字の利用ルール (最重要) ★★★:**
    * **Instagramリール, ストーリーズ, X:** 投稿内容に合わせて、1〜3個の効果的な絵文字を使用してください。
    * **Facebook, LinkedIn, Spotify, Threads:** 投稿が魅力的で華やかになるように、文脈に合わせて5〜7個の絵文字をふんだんに使用してください。特に、箇条書きや重要なポイントで活用すると効果的です。
    * **リール動画のセリフ構成:** タイトルや各セリフの文末に、内容を補足するような絵文字を1つ添えてください。

* **★★★ 各SNSの詳細ルール (最重要) ★★★:**
    1.  **Instagramリール:** キャプション本文: 60〜100文字, ハッシュタグ: 5個
    2.  **Instagramストーリーズ:**
        * **キャプション短文:** 文字数: 10〜60文字, ハッシュタグ: 3個
        * **構成案（字幕＋CTA）:** ハッシュタグ不要
    3.  **Instagramフィード:**
        * **キャプション短文:** 文字数: 125〜150文字, ハッシュタグ: 3個
        * **構成案（カルーセル形式）:** 5〜6枚構成
    4.  **Facebook:** キャプション本文: 150〜200文字, ハッシュタグ: 3個
    5.  **LinkedIn:** キャプション本文: 200〜300文字, ハッシュタグ: 3個
    6.  **X (旧Twitter):** キャプション本文: 80〜150文字, ハッシュタグ: 3個
    7.  **Threads:** キャプション本文: 80〜150文字, ハッシュタグ: 3個
    8.  **Spotify:** キャプション本文: 100〜200文字, ハッシュタグ: 不要
    9.  **リール動画のセリフ構成:** 話者1と話者2が3回ずつ、合計6つのセリフで構成。

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
 */
async function generateContentWithRetry(model, prompt, maxRetries = 3) {
    let attempt = 0;
    while (attempt < maxRetries) {
        try {
            const result = await model.generateContent(prompt);
            return result;
        } catch (error) {
            attempt++;
            if (error.message && (error.message.includes('503') || error.message.includes('overloaded'))) {
                 if (attempt >= maxRetries) {
                    console.error(`Final attempt failed. Error: ${error.message}`);
                    throw new Error(`AIモデルが現在高負荷です。しばらくしてからもう一度お試しください。(Model is overloaded)`);
                }
                const delay = Math.pow(2, attempt) * 1000;
                console.log(`AI model overloaded. Retrying in ${delay / 1000}s... (Attempt ${attempt}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                console.error(`An unexpected error occurred: ${error.message}`);
                throw error;
            }
        }
    }
}

// サーバーの稼働確認用エンドポイント
app.get("/", (req, res) => {
  res.status(200).json({ status: "ok", message: "kotoha sns app API is running." });
});

// SNS投稿を生成するエンドポイント
app.post("/generate-sns", async (req, res) => {
  try {
    const { company, theme, cta, target, url, area } = req.body;

    if (!company || !theme) {
      return res.status(400).json({ error: "会社名と投稿テーマは必須です。" });
    }

    let filledPrompt = promptTemplate
      .replace('{{company}}', company)
      .replace('{{theme}}', theme)
      .replace('{{target}}', target || '指定なし')
      .replace('{{url}}', url || '指定なし')
      .replace('{{cta}}', cta || '指定なし')
      .replace('{{area}}', area || '指定なし');

    const model = genAI.getGenerativeModel({ 
      model: "gemini-1.5-flash",
      generationConfig: {
        responseMimeType: "application/json",
      },
    });
    
    const result = await generateContentWithRetry(model, filledPrompt);
    const response = await result.response;

    if (!response.candidates || response.candidates.length === 0 || !response.text()) {
        const blockReason = response.promptFeedback ? response.promptFeedback.blockReason : '不明な理由';
        console.error(`AI response blocked or empty. Reason: ${blockReason}`);
        return res.status(500).json({ error: `AIが応答を生成できませんでした。入力内容がセーフティポリシーに抵触した可能性があります。理由: ${blockReason}` });
    }

    const text = response.text();

    try {
        let jsonResponse = JSON.parse(text);

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

        res.json(jsonResponse);
        
    } catch (parseError) {
        console.error("Failed to parse JSON from AI response:", text, parseError);
        res.status(500).json({ error: "AIからの応答をJSONとして解析できませんでした。AIの出力形式が不正な可能性があります。" });
    }

  } catch (err) {
    console.error("An unexpected error occurred in the generation process:", err);
    res.status(500).json({ error: `サーバーエラーが発生しました: ${err.message}` });
  }
});

// サーバーを起動
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
