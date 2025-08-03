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
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// --- 各SNSのルールを定義 ---
const platformRules = {
  instagram_reel: {
    prompt: "キャプションを60〜100文字、ハッシュタグを5個、絵文字を1〜3個使用して生成してください。",
    format: `{ "caption": "..." }`
  },
  instagram_stories: {
    prompt: "キャプション短文を10〜60文字、ハッシュタグを3個、絵文字を1〜3個で生成してください。また、箇条書きで3〜5フレームの構成案も生成してください。",
    format: `{ "caption": "...", "structure": "..." }`
  },
  instagram_feed: {
    prompt: "キャプション短文を125〜150文字、ハッシュタグを3個、絵文字を3〜5個で生成してください。また、5〜6枚のカルーセル投稿を想定した各画像の文案も生成してください。",
    format: `{ "caption": "...", "structure": "..." }`
  },
  facebook: {
    prompt: "キャプションを150〜200文字、ハッシュタグを3個、絵文字を5〜7個使用して、投稿が華やかになるように生成してください。",
    format: `{ "caption": "..." }`
  },
  linkedin: {
    prompt: "キャプションを200〜300文字、ハッシュタグを3個、絵文字を3〜5個使用して、専門性が伝わるように生成してください。",
    format: `{ "caption": "..." }`
  },
  x: {
    prompt: "キャプションを80〜150文字、ハッシュタグを3個、絵文字を1〜3個使用して生成してください。",
    format: `{ "caption": "..." }`
  },
  threads: {
    prompt: "キャプションを80〜150文字、ハッシュタグを3個、絵文字を3〜5個使用して生成してください。",
    format: `{ "caption": "..." }`
  },
  spotify: {
    prompt: "キャプションを100〜200文字、ハッシュタグは不要、絵文字を5〜7個使用して、エピソードの楽しさが伝わるように生成してください。",
    format: `{ "caption": "..." }`
  },
  reel_script: {
    prompt: "視聴者を惹きつける魅力的なタイトルと、話者1と話者2が3回ずつ（合計6つ）のセリフで構成されるリール動画台本を生成してください。各セリフの最後に内容に合った絵文字を1つ添えてください。",
    format: `{ "title": "...", "script": [{ "speaker": "話者1", "dialogue": "..." }, { "speaker": "話者2", "dialogue": "..." }, ...] }`
  }
};

/**
 * AIにコンテンツ生成をリクエストする関数
 */
async function generateSinglePlatformContent(platform, userInput) {
  const rule = platformRules[platform];
  if (!rule) return null;

  const prompt = `
    あなたはプロのSNSマーケターです。
    以下の【ユーザー入力】に基づき、【ルール】を厳守してコンテンツを生成してください。
    応答は、解説などを一切含まず、【JSONフォーマット】に厳密に従ったJSONオブジェクトのみとしてください。

    ---
    【ユーザー入力】
    * 会社名/個人名: ${userInput.company}
    * 投稿テーマ: ${userInput.theme}
    * SNSターゲット層: ${userInput.target || '指定なし'}
    * ウェブサイトURL: ${userInput.url || '指定なし'}
    * CTA（行動を促す一言）: ${userInput.cta || '指定なし'}
    * エリア: ${userInput.area || '指定なし'}
    ---
    【ルール】
    ${rule.prompt}
    ---
    【JSONフォーマット】
    ${rule.format}
  `;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    console.error(`[${platform}] Failed to find JSON in response:`, text);
    return null;
  } catch (error) {
    console.error(`[${platform}] Error generating content:`, error);
    return null;
  }
}

// サーバーの稼働確認用エンドポイント
app.get("/", (req, res) => {
  res.status(200).json({ status: "ok", message: "kotoha sns app API is running." });
});

// SNS投稿を生成するエンドポイント
app.post("/generate-sns", async (req, res) => {
  const userInput = req.body;
  const requestedPlatform = userInput.platform || 'all'; // デフォルトは 'all'

  if (!userInput.company || !userInput.theme) {
    return res.status(400).json({ error: "会社名と投稿テーマは必須です。" });
  }

  try {
    let finalResponse = {};

    // ★★★ 選択されたプラットフォームに応じて処理を分岐 ★★★
    if (requestedPlatform === 'all') {
      // "すべて生成する" が選択された場合 (並列処理)
      const generationPromises = Object.keys(platformRules).map(platform => 
        generateSinglePlatformContent(platform, userInput)
      );
      const results = await Promise.all(generationPromises);
      Object.keys(platformRules).forEach((platform, index) => {
        finalResponse[platform] = results[index];
      });
    } else if (platformRules[requestedPlatform]) {
      // 特定のSNSが選択された場合
      const result = await generateSinglePlatformContent(requestedPlatform, userInput);
      finalResponse[requestedPlatform] = result;
    } else {
      return res.status(400).json({ error: "無効なプラットフォームが指定されました。" });
    }

    // URLのプレースホルダーを置換
    if (userInput.url) {
      for (const key in finalResponse) {
        const item = finalResponse[key];
        if (item) {
          if (item.caption) {
            item.caption = item.caption.replace(/\[ウェブサイトURL\]/g, userInput.url).replace(/\[ウェブサイトのURL\]/g, userInput.url);
          }
          if (item.structure && typeof item.structure === 'string') {
            item.structure = item.structure.replace(/\[ウェブサイトURL\]/g, userInput.url).replace(/\[ウェブサイトのURL\]/g, userInput.url);
          }
        }
      }
    }

    res.json(finalResponse);

  } catch (err) {
    console.error("An unexpected error occurred in the main generation process:", err);
    res.status(500).json({ error: `サーバーで予期せぬエラーが発生しました: ${err.message}` });
  }
});

// サーバーを起動
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
