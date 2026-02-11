/**
 * FalakTech News Fetcher v3.0 - Landing Page Edition
 * Purpose: Keep 6 fresh articles to show website is active
 * Strategy: Delete old articles, fetch 6 new daily
 */

const Parser = require('rss-parser');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');

const parser = new Parser({
    customFields: {
        item: [
            ['media:content', 'mediaContent'],
            ['media:thumbnail', 'mediaThumbnail'],
            ['enclosure', 'enclosure']
        ]
    }
});

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// 6 CATEGORIES (1 article each)
const RSS_SOURCES = [
    {
        name: 'NASA',
        url: 'https://www.nasa.gov/rss/dyn/breaking_news.rss',
        category: 'astronomy',
        limit: 1
    },
    {
        name: 'Astronomy.com',
        url: 'https://www.astronomy.com/rss/all',
        category: 'astronomy',
        limit: 1
    },
    {
        name: 'NASA Earth Observatory',
        url: 'https://earthobservatory.nasa.gov/feeds/image-of-the-day.rss',
        category: 'weather',
        limit: 1
    },
    {
        name: 'IslamicFinder',
        url: 'https://www.islamicity.org/feed/',
        category: 'islamic',
        limit: 1,
        keywords: ['islam', 'muslim', 'ramadan', 'mosque', 'quran', 'prayer', 'hajj', 'mecca']
    },
    {
        name: 'VentureBeat AI',
        url: 'https://venturebeat.com/category/ai/feed/',
        category: 'ai',
        limit: 1
    },
    {
        name: 'MIT Tech Review AI',
        url: 'https://www.technologyreview.com/topic/artificial-intelligence/feed',
        category: 'ai',
        limit: 1
    }
];

function extractImage(item) {
    if (item.enclosure && item.enclosure.url) return item.enclosure.url;
    if (item.mediaContent && item.mediaContent.$) return item.mediaContent.$.url;
    if (item.mediaThumbnail && item.mediaThumbnail.$) return item.mediaThumbnail.$.url;
    
    const content = item.content || item['content:encoded'] || '';
    const imgMatch = content.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (imgMatch) return imgMatch[1];
    
    return '';
}

function generateSlug(title) {
    return title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .substring(0, 50);
}

function isRelevant(item, source) {
    if (!source.keywords) return true;
    
    const text = `${item.title} ${item.contentSnippet || ''}`.toLowerCase();
    return source.keywords.some(keyword => text.includes(keyword));
}

async function translateArticle(article, category) {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    
    const prompt = `Translate this news article to Bahasa Malaysia (natural, not word-by-word). Return ONLY valid JSON, no markdown.

Title: ${article.title}
Content: ${(article.contentSnippet || article.title).substring(0, 300)}

Return exactly this format:
{"title_en":"English title (max 80 chars)","title_ms":"Tajuk Melayu natural (max 80 chars)","summary_en":"English summary (max 150 chars)","summary_ms":"Ringkasan Melayu (max 150 chars)"}`;

    try {
        const result = await model.generateContent(prompt);
        const response = result.response.text();
        
        // Extract JSON from response
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
    } catch (error) {
        console.error('   ⚠️ Translation error:', error.message);
    }
    
    // Fallback: No translation (English only)
    return {
        title_en: article.title.substring(0, 80),
        title_ms: article.title.substring(0, 80),
        summary_en: (article.contentSnippet || '').substring(0, 150),
        summary_ms: (article.contentSnippet || '').substring(0, 150)
    };
}

function isDuplicate(title, existing) {
    const norm = title.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 30);
    return existing.some(e => {
        const eNorm = e.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 30);
        return norm.includes(eNorm) || eNorm.includes(norm);
    });
}

function saveArticle(article, translated, source, category) {
    const date = new Date().toISOString().split('T')[0];
    const slug = generateSlug(translated.title_en);
    const filename = `${date}-${slug}.md`;
    const filepath = path.join('news', filename);
    
    if (fs.existsSync(filepath)) {
        console.log(`   ⏭️ Already exists: ${filename}`);
        return null;
    }
    
    const markdown = `---
title_en: "${translated.title_en.replace(/"/g, '\\"')}"
title_ms: "${translated.title_ms.replace(/"/g, '\\"')}"
date: "${date}"
source: "${source.name}"
category: "${category}"
image: "${article.image || ''}"
link: "${article.link || ''}"
---

${translated.summary_en}

---

${translated.summary_ms}
`;

    fs.writeFileSync(filepath, markdown, 'utf8');
    console.log(`   ✅ Saved: ${filename}`);
    return translated.title_en;
}

function cleanAllOldArticles() {
    const newsDir = 'news';
    
    if (!fs.existsSync(newsDir)) {
        console.log('📁 Creating news directory...');
        fs.mkdirSync(newsDir, { recursive: true });
        return;
    }
    
    const files = fs.readdirSync(newsDir);
    let cleaned = 0;
    
    files.forEach(file => {
        if (file === '.gitkeep' || !file.endsWith('.md')) return;
        
        try {
            fs.unlinkSync(path.join(newsDir, file));
            cleaned++;
        } catch (error) {
            console.error(`Error deleting ${file}:`, error.message);
        }
    });
    
    if (cleaned > 0) {
        console.log(`🗑️ Cleaned ${cleaned} old articles\n`);
    }
}

async function main() {
    console.log('🚀 FalakTech News Fetcher v3.0 - Landing Page Edition');
    console.log('📊 Strategy: Keep 6 fresh articles daily\n');
    
    // 🗑️ DELETE ALL old articles (keep website clean)
    cleanAllOldArticles();
    
    const existingTitles = [];
    let total = 0;
    
    for (const source of RSS_SOURCES) {
        console.log(`📡 Fetching from ${source.name}...`);
        
        try {
            const feed = await parser.parseURL(source.url);
            let saved = 0;
            
            for (const item of feed.items) {
                if (saved >= source.limit) break;
                
                // Filter for specific keywords (Islamic category)
                if (!isRelevant(item, source)) {
                    continue;
                }
                
                // Check duplicates
                if (isDuplicate(item.title, existingTitles)) {
                    console.log(`   ⏭️ Duplicate: ${item.title.substring(0, 40)}...`);
                    continue;
                }
                
                const article = {
                    title: item.title,
                    contentSnippet: item.contentSnippet || '',
                    link: item.link || '',
                    image: extractImage(item)
                };
                
                console.log(`   📝 Processing: ${item.title.substring(0, 50)}...`);
                
                // Translate
                const translated = await translateArticle(article, source.category);
                
                // Save
                const savedTitle = saveArticle(article, translated, source, source.category);
                
                if (savedTitle) {
                    existingTitles.push(savedTitle);
                    saved++;
                    total++;
                }
                
                // Delay between articles (avoid rate limit)
                await new Promise(r => setTimeout(r, 2000)); // 2 seconds
            }
            
            console.log(`   ✅ Saved ${saved}/${source.limit} from ${source.name}\n`);
            
        } catch (error) {
            console.error(`   ❌ Error fetching ${source.name}: ${error.message}\n`);
        }
        
        // Delay between sources
        await new Promise(r => setTimeout(r, 3000)); // 3 seconds
    }
    
    console.log(`\n🎉 Total saved: ${total} articles`);
    console.log(`✅ Website news section updated with fresh content`);
}

main().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
});
