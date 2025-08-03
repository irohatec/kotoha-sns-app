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

あなたは、非常に優秀で信頼性の高いSNSマーケティング担当者です。
以下の【入力情報】に基づき、【各SNSのルール】を厳格に守って、投稿コンテンツを生成してください。
あなたの応答は、解説や前置き、マークダウン記法(\`\`\`)を一切含まず、指定された【出力フォーマット】のJSONオブジェクトのみでなければなりません。

---

## 【入力情報】
* **会社名/個人名:** {{company}}
* **投稿テーマ:** {{theme}}
* **SNSターゲット層:** {{target}}
* **ウェブサイトURL:** {{url}}
* **CTA（行動を促す一言）:** {{cta}}
* **エリア:** {{area}}

---

## 【各SNSのルール】

1.  **Instagramリール:**
    * キャプション: 60〜100文字
    * ハッシュタグ: 5個
    * 絵文字: 1〜3個を効果的に使用

2.  **Instagramストーリーズ:**
    * キャプション短文: 10〜60文字, ハッシュタグ: 3個, 絵文字: 1〜3個
    * 構成案: 箇条書きで3〜5フレームの構成案を提示。ハッシュタグ不要

3.  **Instagramフィード:**
    * キャプション短文: 125〜150文字, ハッシュタグ: 3個
    * 絵文字: 3〜5個を効果的に使用
    * 構成案: 5〜6枚のカルーセル投稿を想定した各画像の文案を提示

4.  **Facebook:**
    * キャプション: 150〜200文字, ハッシュタグ: 3個
    * 絵文字: 5〜7個を積極的に使用し、投稿を華やかにする

5.  **LinkedIn:**
    * キャプション: 200〜300文字, ハッシュタグ: 3個
    * 絵文字: 3〜5個を使い、専門性を表現する

6.  **X (旧Twitter):**
    * キャプション: 80〜150文字, ハッシュタグ: 3個
    * 絵文字: 1〜3個を効果的に使用

7.  **Threads:**
    * キャプション: 80〜150文字, ハッシュタグ: 3個
    * 絵文字: 3〜5個を積極的に使用

8.  **Spotify:**
    * キャプション: 100〜200文字, ハッシュタグ: 不要
    * 絵文字: 5〜7個を積極的に使用し、エピソードの楽しさを表現する

9.  **リール動画のセリフ構成:**
    * タイトル: 視聴者を惹きつける魅力的なタイトル
    * セリフ: 話者1と話者2が3回ずつ、合計6つのセリフで構成。各セリフの最後に内容に合った絵文字を1つ添える

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
