/**
 * FalakTech Multi-Source News Fetcher v2.0
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

const RSS_SOURCES = [
    {
        name: 'NASA',
        url: 'https://www.nasa.gov/rss/dyn/breaking_news.rss',
        category: 'astronomy',
        limit: 2
    },
    {
        name: 'Space.com',
        url: 'https://www.space.com/feeds/all',
        category: 'astronomy',
        limit: 1
    },
    {
        name: 'NASA Earth',
        url: 'https://earthobservatory.nasa.gov/feeds/image-of-the-day.rss',
        category: 'weather',
        limit: 1
    },
    {
        name: 'EarthSky',
        url: 'https://earthsky.org/space/feed/',
        category: 'astronomy',
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
    return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 50);
}

async function translateArticle(article, category) {
    const model = genAI.getGenerativeModel({ model: 'models/gemini-2.0-flash' });
    
    const prompt = `Translate this news article. Return ONLY valid JSON, nothing else.

Title: ${article.title}
Content: ${(article.contentSnippet || article.title).substring(0, 300)}

Return this exact format:
{"title_en":"English title max 80 chars","title_ms":"Tajuk Melayu max 80 chars","summary_en":"English summary max 150 chars","summary_ms":"Ringkasan Melayu max 150 chars"}`;

    try {
        const result = await model.generateContent(prompt);
        const response = result.response.text();
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) return JSON.parse(jsonMatch[0]);
    } catch (error) {
        console.error('Translation error:', error.message);
    }
    
    return {
        title_en: article.title,
        title_ms: article.title,
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
        console.log(`   ⏭️ Exists: ${filename}`);
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

async function main() {
    console.log('🚀 FalakTech News Fetcher v2.0\n');
    
    if (!fs.existsSync('news')) {
        fs.mkdirSync('news', { recursive: true });
    }
    
    const existingTitles = [];
    let total = 0;
    
    for (const source of RSS_SOURCES) {
        console.log(`\n📡 Fetching from ${source.name}...`);
        
        try {
            const feed = await parser.parseURL(source.url);
            let saved = 0;
            
            for (const item of feed.items) {
                if (saved >= source.limit) break;
                
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
                
                const translated = await translateArticle(article, source.category);
                const savedTitle = saveArticle(article, translated, source, source.category);
                
                if (savedTitle) {
                    existingTitles.push(savedTitle);
                    saved++;
                    total++;
                }
                
                await new Promise(r => setTimeout(r, 1500));
            }
            
            console.log(`   ✅ Saved ${saved}/${source.limit} from ${source.name}`);
            
        } catch (error) {
            console.error(`   ❌ Error: ${error.message}`);
        }
    }
    
    console.log(`\n🎉 Total saved: ${total}`);
}

main().catch(console.error);
