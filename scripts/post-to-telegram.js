const fs = require("fs");
const path = require("path");
const https = require("https");

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHANNEL_ID;
const NEWS_DIR = path.join(__dirname, "../news");

function getLatestArticle() {
    const files = fs.readdirSync(NEWS_DIR)
        .filter(f => f.endsWith(".md") && !f.startsWith("."))
        .sort()
        .reverse();
    
    if (files.length === 0) return null;
    
    for (const file of files) {
        const article = parseArticle(path.join(NEWS_DIR, file));
        if (article && (article.category === "astronomy" || article.category === "ai")) {
            return article;
        }
    }
    return parseArticle(path.join(NEWS_DIR, files[0]));
}

function parseArticle(filepath) {
    let content = fs.readFileSync(filepath, "utf8");
    content = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    
    const parts = content.split("---");
    if (parts.length < 3) return null;
    
    const frontmatter = {};
    parts[1].trim().split("\n").forEach(line => {
        const colonIndex = line.indexOf(":");
        if (colonIndex > 0) {
            const key = line.substring(0, colonIndex).trim();
            const value = line.substring(colonIndex + 1).trim().replace(/^["']|["']$/g, "");
            frontmatter[key] = value;
        }
    });
    
    const body = parts.slice(2).join("---").trim().split("\n\n")[0];
    return { ...frontmatter, body };
}

function formatMessage(article) {
    const icons = { astronomy: "??", ai: "??", islamic: "??", weather: "??" };
    const tags = { 
        astronomy: "#Astronomy #Space #NASA", 
        ai: "#AI #Technology", 
        islamic: "#Islamic #Muslim", 
        weather: "#Earth #Climate" 
    };
    
    const icon = icons[article.category] || "??";
    const hashtags = tags[article.category] || "#News";
    
    let msg = icon + " *" + article.title_en + "*\n\n";
    msg += article.body.substring(0, 200) + "...\n\n";
    msg += "?? " + article.link + "\n\n";
    msg += "_Source: " + article.source + "_\n";
    msg += hashtags + "\n\n";
    msg += "via [FalakTech](https://falaktech.my)";
    return msg;
}

async function sendToTelegram(message) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify({
            chat_id: CHAT_ID,
            text: message,
            parse_mode: "Markdown",
            disable_web_page_preview: false
        });
        
        const req = https.request({
            hostname: "api.telegram.org",
            path: "/bot" + BOT_TOKEN + "/sendMessage",
            method: "POST",
            headers: { "Content-Type": "application/json", "Content-Length": data.length }
        }, res => {
            let body = "";
            res.on("data", chunk => body += chunk);
            res.on("end", () => {
                if (res.statusCode === 200) {
                    console.log("Posted to Telegram!");
                    resolve(JSON.parse(body));
                } else {
                    reject(new Error("API error: " + body));
                }
            });
        });
        req.on("error", reject);
        req.write(data);
        req.end();
    });
}

async function main() {
    console.log("Starting Telegram poster...");
    
    if (!BOT_TOKEN || !CHAT_ID) {
        throw new Error("Missing env vars");
    }
    
    const article = getLatestArticle();
    if (!article) {
        console.log("No articles found");
        return;
    }
    
    console.log("Selected:", article.title_en);
    const message = formatMessage(article);
    console.log("Message:\n", message);
    await sendToTelegram(message);
}

main().catch(err => { console.error("Error:", err.message); process.exit(1); });
