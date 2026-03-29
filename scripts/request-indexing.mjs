/**
 * Google Indexing API — Request indexing for new blog posts.
 * 
 * Prerequisites:
 * 1. Enable "Web Search Indexing API" in Google Cloud Console
 * 2. Create a Service Account and download the JSON key
 * 3. Add the service account email as an owner in Google Search Console
 * 4. Set GOOGLE_SERVICE_ACCOUNT_JSON as a GitHub secret (the JSON key content)
 * 
 * Usage:
 *   GOOGLE_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}' node scripts/request-indexing.mjs
 *   
 * The script reads the sitemap, finds URLs that were recently added,
 * and requests Google to crawl them.
 */

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SITE_URL = "https://ai-trend-news.com";
const INDEXING_API_URL = "https://indexing.googleapis.com/v3/urlNotifications:publish";

// --- Google Auth ---
async function getAccessToken(serviceAccountJson) {
  const sa = JSON.parse(serviceAccountJson);
  
  // Create JWT
  const header = { alg: "RS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/indexing",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  // Import crypto for JWT signing
  const crypto = await import("crypto");
  
  const encode = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  const signingInput = `${encode(header)}.${encode(payload)}`;
  
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(signingInput);
  const signature = sign.sign(sa.private_key, "base64url");
  
  const jwt = `${signingInput}.${signature}`;

  // Exchange JWT for access token
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  if (!res.ok) {
    throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  return data.access_token;
}

// --- Get blog post URLs from content directory ---
async function getRecentBlogUrls() {
  const blogDir = path.resolve(__dirname, "..", "src", "content", "blog");
  const files = await fs.readdir(blogDir);
  
  const urls = [];
  for (const file of files) {
    if (!file.endsWith(".md") && !file.endsWith(".mdx")) continue;
    const slug = file.replace(/\.(md|mdx)$/, "");
    urls.push(`${SITE_URL}/blog/${slug}/`);
  }
  
  return urls;
}

// --- Request indexing for a URL ---
async function requestIndexing(url, accessToken) {
  const res = await fetch(INDEXING_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      url: url,
      type: "URL_UPDATED",
    }),
  });

  if (res.ok) {
    const data = await res.json();
    console.log(`  ✅ ${url} — indexed (${data.urlNotificationMetadata?.latestUpdate?.type || 'OK'})`);
    return true;
  } else {
    const errText = await res.text();
    console.error(`  ❌ ${url} — failed (${res.status}): ${errText}`);
    return false;
  }
}

// --- Main ---
async function main() {
  const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  
  if (!serviceAccountJson) {
    console.log("⏭️  GOOGLE_SERVICE_ACCOUNT_JSON not set — skipping indexing request.");
    console.log("   To enable: Add your Google service account JSON as a GitHub secret.");
    process.exit(0); // Exit cleanly, not as error
  }

  console.log("🔎 Google Indexing API — Requesting crawl for blog posts...\n");

  try {
    // Get access token
    console.log("🔑 Authenticating with Google...");
    const accessToken = await getAccessToken(serviceAccountJson);
    console.log("  ✅ Authenticated\n");

    // Get all blog URLs
    const urls = await getRecentBlogUrls();
    console.log(`📝 Found ${urls.length} blog posts to index:\n`);

    // Request indexing for each URL
    let success = 0;
    let failed = 0;
    
    for (const url of urls) {
      const ok = await requestIndexing(url, accessToken);
      if (ok) success++;
      else failed++;
      
      // Rate limit: Google allows ~200 requests/day
      await new Promise(r => setTimeout(r, 500));
    }

    console.log(`\n📊 Results: ${success} succeeded, ${failed} failed out of ${urls.length} total`);
    
    if (failed > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
}

main();
