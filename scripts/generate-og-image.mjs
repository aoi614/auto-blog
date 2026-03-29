import satori from "satori";
import sharp from "sharp";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

// Load Noto Sans JP font for satori
async function loadFont() {
  // Download from Google Fonts API (subset for performance)
  const fontUrl = "https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@700&display=swap";
  const cssRes = await fetch(fontUrl, {
    headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" },
  });
  const css = await cssRes.text();

  // Extract font file URL from CSS (woff2 or ttf)
  const match = css.match(/src:\s*url\(([^)]+)\)\s*format\(['"](?:woff2|truetype)['"]\)/);
  if (!match) throw new Error("Could not find font URL in Google Fonts CSS: " + css.substring(0, 200));

  const fontRes = await fetch(match[1]);
  const fontBuffer = await fontRes.arrayBuffer();
  return Buffer.from(fontBuffer);
}

// Generate OG image for a single article
async function generateOgImage(title, slug, fontData, outputDir) {
  // Truncate title if too long
  const displayTitle = title.length > 40 ? title.substring(0, 38) + "…" : title;

  const svg = await satori(
    {
      type: "div",
      props: {
        style: {
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          background: "linear-gradient(135deg, #0c1222 0%, #0f172a 40%, #1e293b 100%)",
          padding: "60px",
          position: "relative",
        },
        children: [
          // Decorative gradient orbs
          {
            type: "div",
            props: {
              style: {
                position: "absolute",
                top: "-60px",
                right: "-60px",
                width: "300px",
                height: "300px",
                borderRadius: "50%",
                background: "radial-gradient(circle, rgba(14,165,233,0.3) 0%, transparent 70%)",
              },
            },
          },
          {
            type: "div",
            props: {
              style: {
                position: "absolute",
                bottom: "-40px",
                left: "-40px",
                width: "250px",
                height: "250px",
                borderRadius: "50%",
                background: "radial-gradient(circle, rgba(56,189,248,0.2) 0%, transparent 70%)",
              },
            },
          },
          // Site branding
          {
            type: "div",
            props: {
              style: {
                display: "flex",
                alignItems: "center",
                gap: "12px",
                marginBottom: "32px",
              },
              children: [
                {
                  type: "div",
                  props: {
                    style: {
                      fontSize: "24px",
                      color: "#0ea5e9",
                      fontWeight: 700,
                      letterSpacing: "0.05em",
                    },
                    children: "🚀 AIトレンド速報",
                  },
                },
              ],
            },
          },
          // Accent line
          {
            type: "div",
            props: {
              style: {
                width: "80px",
                height: "4px",
                background: "linear-gradient(90deg, #0ea5e9, #38bdf8)",
                borderRadius: "2px",
                marginBottom: "32px",
              },
            },
          },
          // Title
          {
            type: "div",
            props: {
              style: {
                fontSize: title.length > 25 ? "42px" : "52px",
                fontWeight: 700,
                color: "#f1f5f9",
                textAlign: "center",
                lineHeight: 1.4,
                maxWidth: "1000px",
                display: "flex",
              },
              children: displayTitle,
            },
          },
          // Bottom bar
          {
            type: "div",
            props: {
              style: {
                position: "absolute",
                bottom: "0",
                left: "0",
                right: "0",
                height: "6px",
                background: "linear-gradient(90deg, #0ea5e9, #38bdf8, #0ea5e9)",
              },
            },
          },
        ],
      },
    },
    {
      width: OG_WIDTH,
      height: OG_HEIGHT,
      fonts: [
        {
          name: "Noto Sans JP",
          data: fontData,
          weight: 700,
          style: "normal",
        },
      ],
    }
  );

  const pngBuffer = await sharp(Buffer.from(svg)).png({ quality: 90 }).toBuffer();

  const outputPath = path.join(outputDir, `${slug}.png`);
  await fs.writeFile(outputPath, pngBuffer);
  console.log(`  ✅ Generated: ${outputPath}`);
  return outputPath;
}

// Parse frontmatter from a markdown file
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const frontmatter = {};
  match[1].split("\n").forEach((line) => {
    const [key, ...rest] = line.split(":");
    if (key && rest.length) {
      frontmatter[key.trim()] = rest.join(":").trim().replace(/^['"]|['"]$/g, "");
    }
  });
  return frontmatter;
}

async function main() {
  console.log("🎨 OG Image Generator Starting...\n");

  // Load font
  console.log("📦 Loading Noto Sans JP font...");
  const fontData = await loadFont();
  console.log("  ✅ Font loaded\n");

  // Ensure output directory exists
  const outputDir = path.resolve(__dirname, "..", "public", "og");
  await fs.mkdir(outputDir, { recursive: true });

  // Read all blog posts
  const blogDir = path.resolve(__dirname, "..", "src", "content", "blog");
  const files = await fs.readdir(blogDir);
  const mdFiles = files.filter((f) => f.endsWith(".md") || f.endsWith(".mdx"));

  console.log(`📝 Found ${mdFiles.length} articles\n`);

  let generated = 0;
  let skipped = 0;

  for (const file of mdFiles) {
    const slug = file.replace(/\.(md|mdx)$/, "");
    const outputPath = path.join(outputDir, `${slug}.png`);

    // Skip if already exists (unless --force flag)
    if (!process.argv.includes("--force")) {
      try {
        await fs.access(outputPath);
        console.log(`  ⏩ Skipped (exists): ${slug}`);
        skipped++;
        continue;
      } catch {
        // File doesn't exist, proceed
      }
    }

    const content = await fs.readFile(path.join(blogDir, file), "utf-8");
    const frontmatter = parseFrontmatter(content);

    if (!frontmatter || !frontmatter.title) {
      console.log(`  ⚠️ Skipped (no title): ${file}`);
      skipped++;
      continue;
    }

    await generateOgImage(frontmatter.title, slug, fontData, outputDir);
    generated++;
  }

  console.log(`\n🎉 Done! Generated: ${generated}, Skipped: ${skipped}`);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
