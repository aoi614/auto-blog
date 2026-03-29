import { GoogleGenerativeAI } from "@google/generative-ai";
import Parser from "rss-parser";
import fs from "fs/promises";
import path from "path";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import satori from "satori";
import sharp from "sharp";

// Load environment variables correctly
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ===== OG Image Generation (inline) =====
const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

async function loadFont() {
  const fontUrl = "https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@700&display=swap";
  const cssRes = await fetch(fontUrl, {
    headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" },
  });
  const css = await cssRes.text();
  const match = css.match(/src:\s*url\(([^)]+)\)\s*format\(['"](?:woff2|truetype)['"]\)/);
  if (!match) throw new Error("Could not find font URL in Google Fonts CSS");
  const fontRes = await fetch(match[1]);
  return Buffer.from(await fontRes.arrayBuffer());
}

async function generateOgImage(title, slug, fontData, outputDir) {
  const displayTitle = title.length > 40 ? title.substring(0, 38) + "…" : title;
  const svg = await satori(
    {
      type: "div",
      props: {
        style: {
          width: "100%", height: "100%", display: "flex", flexDirection: "column",
          justifyContent: "center", alignItems: "center",
          background: "linear-gradient(135deg, #0c1222 0%, #0f172a 40%, #1e293b 100%)",
          padding: "60px", position: "relative",
        },
        children: [
          { type: "div", props: { style: { position: "absolute", top: "-60px", right: "-60px", width: "300px", height: "300px", borderRadius: "50%", background: "radial-gradient(circle, rgba(14,165,233,0.3) 0%, transparent 70%)" } } },
          { type: "div", props: { style: { position: "absolute", bottom: "-40px", left: "-40px", width: "250px", height: "250px", borderRadius: "50%", background: "radial-gradient(circle, rgba(56,189,248,0.2) 0%, transparent 70%)" } } },
          { type: "div", props: { style: { display: "flex", alignItems: "center", gap: "12px", marginBottom: "32px" }, children: [{ type: "div", props: { style: { fontSize: "24px", color: "#0ea5e9", fontWeight: 700, letterSpacing: "0.05em" }, children: "🚀 AIトレンド速報" } }] } },
          { type: "div", props: { style: { width: "80px", height: "4px", background: "linear-gradient(90deg, #0ea5e9, #38bdf8)", borderRadius: "2px", marginBottom: "32px" } } },
          { type: "div", props: { style: { fontSize: title.length > 25 ? "42px" : "52px", fontWeight: 700, color: "#f1f5f9", textAlign: "center", lineHeight: 1.4, maxWidth: "1000px", display: "flex" }, children: displayTitle } },
          { type: "div", props: { style: { position: "absolute", bottom: "0", left: "0", right: "0", height: "6px", background: "linear-gradient(90deg, #0ea5e9, #38bdf8, #0ea5e9)" } } },
        ],
      },
    },
    { width: OG_WIDTH, height: OG_HEIGHT, fonts: [{ name: "Noto Sans JP", data: fontData, weight: 700, style: "normal" }] }
  );
  const pngBuffer = await sharp(Buffer.from(svg)).png({ quality: 90 }).toBuffer();
  const outputPath = path.join(outputDir, `${slug}.png`);
  await fs.writeFile(outputPath, pngBuffer);
  console.log(`  ✅ OG image generated: ${outputPath}`);
  return outputPath;
}

// ===== Duplicate Prevention: Load existing article titles =====
async function getExistingTitles() {
  const blogDir = path.resolve(__dirname, "..", "src", "content", "blog");
  try {
    const files = await fs.readdir(blogDir);
    const titles = [];
    for (const file of files) {
      if (!file.endsWith(".md") && !file.endsWith(".mdx")) continue;
      const content = await fs.readFile(path.join(blogDir, file), "utf-8");
      const titleMatch = content.match(/title:\s*["']([^"']+)["']/);
      if (titleMatch) {
        titles.push(titleMatch[1]);
      }
    }
    return titles;
  } catch {
    return [];
  }
}

// ===== Article Generation =====
async function generateArticle() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("Error: GEMINI_API_KEY is not set in the environment variables.");
    process.exit(1);
  }

  // Initialize the Gemini AI client
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  // --- Fetch Latest AI News from Google News RSS ---
  console.log("Fetching latest AI news from Google News RSS...");
  const parser = new Parser();
  // Fetch Japan Google News for AI topics
  const query = encodeURIComponent('AI OR ChatGPT OR 生成AI');
  const feed = await parser.parseURL(`https://news.google.com/rss/search?q=${query}&hl=ja&gl=JP&ceid=JP:ja`);
  
  // Extract top 10 most recent headlines
  const topNews = feed.items.slice(0, 10).map((item, i) => `${i+1}. ${item.title} (${item.pubDate})`).join("\n");
  console.log("📰 Today's Headlines Found:\n" + topNews);

  // --- Load existing titles for duplicate prevention ---
  const existingTitles = await getExistingTitles();
  console.log(`📝 Existing articles: ${existingTitles.length} found`);

  const duplicateGuard = existingTitles.length > 0
    ? `\n\n### DUPLICATE PREVENTION (CRITICAL):\nThe following topics have ALREADY been written about on this blog. Do NOT choose the same or very similar topics:\n${existingTitles.map((t, i) => `- ${t}`).join("\n")}\n\nChoose a DIFFERENT, FRESH topic from the headlines above that is NOT covered by any of the existing articles.\n`
    : "";

  const prompt = `
    You are an expert AI researcher and tech blog writer specializing in Artificial Intelligence. 
    Below are the top 10 trending AI news headlines in Japan RIGHT NOW:
    
    ${topNews}
    
    CRITICAL INSTRUCTION: Choose exactly ONE of the most interesting, impactful headlines from the list above, and write a high-quality, engaging, and deeply informative news blog post about it. Do not just list the news; write a full article unpacking that single topic, adding your own simulated "expert insight" on why it matters.
    ${duplicateGuard}
    
    The output MUST be exactly in valid Markdown format suitable for an Astro framework blog.
    Do not wrap the whole response in a markdown code block (\`\`\`markdown \`\`\`). Starts immediately with the frontmatter.
    Include the following YAML frontmatter at the very top of the file:
    ---
    title: "[A Catchy, Clickable Title about the AI topic]"
    description: "[A compelling SEO description in 120-160 characters. Include the main keyword naturally. Make it actionable and curiosity-inducing.]"
    pubDate: "YYYY-MM-DD"
    ---
    
    ### ARTICLE STRUCTURE REQUIREMENTS:
    1. **Opening hook** (2-3 sentences): Start with a compelling, attention-grabbing statement that makes the reader want to continue. NO generic introductions.
    2. **4-5 main sections** with H2 headings: Each section should be substantial (300+ words).
    3. **Sub-sections** with H3 headings where appropriate.
    4. **Total article length**: Minimum 2000 characters in Japanese. Aim for thorough, in-depth coverage.
    5. **Bullet points and lists** where they add clarity.
    6. **Bold text** for key terms and emphasis (use naturally, not on every keyword).
    7. End with a forward-looking perspective, NOT a generic summary.
    
    ### CRITICAL WRITING STYLE RULES (ANTI-AI DETECTION):
    1. WRITE LIKE A HUMAN TECH BLOGGER. Use a conversational, enthusiastic, and slightly informal tone in Japanese (Desu/Masu form, but natural).
    2. NEVER use typical robotic AI phrases like "結論から言うと", "〜について解説します", "いかがでしたか？", "この記事では〜を紹介しました", "最後に", "まとめ", or "AI言語モデルとして".
    3. Include "personal opinions" or simulated hands-on experiences (e.g., "実際に触ってみて驚いたのは…", "個人的にはここが神機能だと思いました").
    4. Do not make the structure perfectly symmetric. Real humans write with varying paragraph lengths and use bolding (**) naturally for emphasis, not just on every keyword.
    5. Do not write a generic dictionary-style explanation. Write it as a "Hot News/Review" column.
    6. Use varied sentence structures. Mix short punchy sentences with longer analytical ones.
    7. Include specific numbers, dates, or data points when available to add credibility.
    
    ### SEO OPTIMIZATION:
    1. The description should be 120-160 characters, containing the primary keyword naturally.
    2. Use the primary keyword in the first paragraph and in at least 2 H2 headings.
    3. Include related keywords and synonyms throughout the article naturally.
    
    ### CTA SECTION (MANDATORY):
    At the very end of the article (after all main content), add a section with this exact format:
    
    ## 🔗 関連ツール・サービス
    
    List 2-4 AI tools or services that are directly relevant to the article topic. For each tool:
    - Use this format: **[ツール名](公式URL)** — 一行説明（日本語で30-50文字）
    - Only include tools that are ACTUALLY mentioned or directly related to the article
    - Use real, correct official URLs (e.g., https://chat.openai.com/ for ChatGPT, https://claude.ai/ for Claude, https://gemini.google.com/ for Gemini)
    - Do NOT make up fake URLs
    
    Make it highly readable, optimized for SEO, and extremely valuable.
  `;

  try {
    console.log("Generating article with Gemini API...");
    const result = await model.generateContent(prompt);
    const response = await result.response;
    let text = response.text();

    // Clean up if the AI wrapped the response in a markdown code block by mistake
    text = text.trim();
    if (text.startsWith("\`\`\`markdown")) {
      text = text.substring(13, text.length - 3).trim();
    } else if (text.startsWith("\`\`\`")) {
      text = text.substring(3, text.length - 3).trim();
    }

    // Replace the pubDate in the frontmatter with today's date
    const today = new Date();
    const formattedDate = today.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: '2-digit'
    });
    
    text = text.replace(/pubDate:\s*["'][^"']+["']/, `pubDate: '${formattedDate}'`);

    // Extract title from frontmatter to create a filename
    const titleMatch = text.match(/title:\s*["']([^"']+)["']/);
    let slug = `auto-generated-${Date.now()}`;
    
    if (titleMatch && titleMatch[1]) {
      // Create a URL-friendly slug from the title
      let s = titleMatch[1]
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '');
      if (s) {
        slug = s.substring(0, 50) + `-${Date.now().toString().slice(-4)}`;
      }
    }

    const filename = `${slug}.md`;

    // --- Generate OG image for the new article ---
    const ogDir = path.resolve(__dirname, "..", "src", "assets", "og");
    await fs.mkdir(ogDir, { recursive: true });

    console.log("\n🎨 Generating OG image...");
    const fontData = await loadFont();
    const articleTitle = titleMatch ? titleMatch[1] : slug;
    await generateOgImage(articleTitle, slug, fontData, ogDir);

    // Add heroImage to frontmatter
    text = text.replace(
      /^(---\n[\s\S]*?)(---)/,
      (match, front, end) => front + `heroImage: "../../assets/og/${slug}.png"\n` + end
    );

    // Define the output directory based on Astro's content collections
    const blogDir = path.resolve(__dirname, "..", "src", "content", "blog");
    await fs.mkdir(blogDir, { recursive: true });
    
    const filePath = path.join(blogDir, filename);
    
    // Write the Markdown file
    await fs.writeFile(filePath, text, "utf-8");
    console.log(`\n✅ Successfully created new article: ${filePath}`);
    console.log(`🖼️  OG image: src/assets/og/${slug}.png`);
    
  } catch (error) {
    console.error("Error generating article:", error);
    process.exit(1);
  }
}

generateArticle();
