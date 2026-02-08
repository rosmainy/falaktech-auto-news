const { GoogleGenerativeAI } = require('@google/generative-ai');
const Parser = require('rss-parser');
const fs = require('fs');
const path = require('path');

// Initialize
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const parser = new Parser();

async function main() {
  console.log('🤖 FalakTech News Agent Started');
  console.log('⏰ Time:', new Date().toISOString());
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  try {
    // Fetch news from NASA
    console.log('📰 Fetching latest astronomy news from NASA...');
    const feed = await parser.parseURL('https://www.nasa.gov/rss/dyn/breaking_news.rss');
    
    const articles = feed.items.slice(0, 2); // Process 2 for testing
    console.log(`✅ Found ${articles.length} articles to process\n`);
    
    // Initialize AI model
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
    
    // Process each article
    for (let i = 0; i < articles.length; i++) {
      const article = articles[i];
      const titlePreview = article.title.substring(0, 60) + (article.title.length > 60 ? '...' : '');
      
      console.log(`📝 [Article ${i+1}/${articles.length}]`);
      console.log(`   Title: ${titlePreview}`);
      
      // Prepare AI prompt
      const prompt = `Translate this astronomy/space news to natural Bahasa Malaysia and create a summary.

Original Title: ${article.title}
Content: ${article.contentSnippet || article.description || 'No content'}

Return ONLY valid JSON (no markdown formatting, no code blocks):
{
  "title_ms": "Translated title in natural conversational Malay",
  "summary_ms": "Engaging summary in Malay (150-200 words, 2-3 paragraphs). Make it interesting for Malaysian readers.",
  "keywords": ["kata kunci 1", "kata kunci 2", "kata kunci 3"]
}`;
      
      try {
        // Call Gemini API
        const result = await model.generateContent(prompt);
        const responseText = result.response.text();
        
        // Extract JSON from response
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          console.log('   ⚠️  AI response invalid - skipping this article\n');
          continue;
        }
        
        const data = JSON.parse(jsonMatch[0]);
        const translatedPreview = data.title_ms.substring(0, 60) + (data.title_ms.length > 60 ? '...' : '');
        
        console.log(`   ✅ Translation: ${translatedPreview}`);
        
        // Create news directory if doesn't exist
        const newsDir = path.join(process.cwd(), 'news');
        if (!fs.existsSync(newsDir)) {
          fs.mkdirSync(newsDir, { recursive: true });
          console.log('   📁 Created news/ directory');
        }
        
        // Generate filename
        const timestamp = Date.now();
        const filename = `article-${timestamp}-${i}.md`;
        
        // Create markdown content
        const dateFormatted = new Date().toLocaleDateString('ms-MY', {
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        });
        
        const markdownContent = `# ${data.title_ms}

**📅 Tarikh Diterbitkan:** ${dateFormatted}  
**🔗 Sumber Asal:** [${article.title}](${article.link})  
**📂 Kategori:** Astronomi & Sains Angkasa

---

## 📖 Ringkasan

${data.summary_ms}

---

**🏷️ Kata Kunci:** ${data.keywords.join(' • ')}

---

<small>

*Artikel ini diterjemahkan secara automatik menggunakan teknologi AI daripada sumber berita [NASA](${article.link}). Untuk maklumat terperinci, sila rujuk artikel asal.*

**Penafian:** Terjemahan automatik mungkin tidak sempurna. Untuk ketepatan penuh, rujuk sumber asal dalam Bahasa Inggeris.

</small>
`;
        
        // Save to file
        const filepath = path.join(newsDir, filename);
        fs.writeFileSync(filepath, markdownContent);
        console.log(`   💾 Saved: news/${filename}`);
        console.log('   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        
        // Small delay to avoid rate limits
        if (i < articles.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
      } catch (error) {
        console.error(`   ❌ Error processing article: ${error.message}\n`);
        continue;
      }
    }
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎉 Process completed successfully!');
    console.log(`📊 Total articles processed: ${articles.length}`);
    console.log(`📁 Check the news/ folder for generated articles`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
  } catch (error) {
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('❌ FATAL ERROR:');
    console.error('   Message:', error.message);
    console.error('   Stack:', error.stack);
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    process.exit(1);
  }
}

// Run the agent
main();
