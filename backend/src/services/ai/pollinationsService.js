/**
 * Pollinations AI Service
 * Free AI text generation without API keys
 * https://pollinations.ai
 */

const POLLINATIONS_URL = "https://text.pollinations.ai";

/**
 * Generate an AI news headline using Pollinations AI
 * Falls back to the provided template headline if AI generation fails
 * 
 * @param {string} category - GLOBAL | POLITICAL | INDUSTRY | COMPANY
 * @param {string} sentiment - positive | negative | neutral
 * @param {string} target - company name/symbol, industry name, or empty for global
 * @param {string} fallbackHeadline - template headline to use if AI fails
 * @returns {Promise<string>} Generated headline
 */
export async function generateHeadline(category, sentiment, target, fallbackHeadline) {
  try {
    const prompt = buildPrompt(category, sentiment, target);
    
    // Pollinations AI uses URL-encoded prompts
    const encodedPrompt = encodeURIComponent(prompt);
    const response = await fetch(`${POLLINATIONS_URL}/${encodedPrompt}`, {
      method: "GET",
      headers: { "Accept": "text/plain" },
      signal: AbortSignal.timeout(5000), // 5 second timeout
    });
    
    if (!response.ok) {
      console.warn("[PollinationsAI] Request failed, using fallback");
      return fallbackHeadline;
    }
    
    let headline = await response.text();
    
    // Clean up the response
    headline = headline.trim();
    // Remove quotes if present
    headline = headline.replace(/^["']|["']$/g, "");
    // Ensure it's not too long
    if (headline.length > 200) {
      headline = headline.substring(0, 200) + "...";
    }
    
    return headline || fallbackHeadline;
  } catch (error) {
    console.warn("[PollinationsAI] Error generating headline:", error.message);
    return fallbackHeadline;
  }
}

/**
 * Build a prompt for headline generation
 */
function buildPrompt(category, sentiment, target) {
  const sentimentWord = sentiment === "positive" ? "bullish/positive" 
    : sentiment === "negative" ? "bearish/negative" 
    : "neutral";
  
  const prompts = {
    GLOBAL: `Generate a single realistic ${sentimentWord} financial news headline about global markets or the economy. No quotes, just the headline:`,
    POLITICAL: `Generate a single realistic ${sentimentWord} financial news headline about politics affecting markets. No quotes, just the headline:`,
    INDUSTRY: `Generate a single realistic ${sentimentWord} financial news headline about the ${target} industry/sector. No quotes, just the headline:`,
    COMPANY: `Generate a single realistic ${sentimentWord} financial news headline about ${target}. No quotes, just the headline:`,
  };
  
  return prompts[category] || prompts.GLOBAL;
}

/**
 * Batch generate headlines (with rate limiting)
 * Useful during populate phase
 */
export async function batchGenerateHeadlines(requests, concurrency = 3) {
  const results = [];
  
  for (let i = 0; i < requests.length; i += concurrency) {
    const batch = requests.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(req => 
        generateHeadline(req.category, req.sentiment, req.target, req.fallback)
      )
    );
    results.push(...batchResults);
    
    // Rate limit: wait 500ms between batches
    if (i + concurrency < requests.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  return results;
}
