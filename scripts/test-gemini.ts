import { GoogleGenerativeAI } from "@google/generative-ai";

/**
 * Test Gemini API connection
 * Run: npx ts-node scripts/test-gemini.ts
 */
export async function testGeminiAPI() {
  try {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY not set in environment");
    }

    console.log("🔄 Testing Gemini API...");
    
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });

    const prompt = "What are the first aid steps for a severe allergic reaction? Respond in JSON format with: {steps: [], duration: 'time', seek_emergency: boolean}";

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    console.log("✅ Gemini API Connected!");
    console.log("📝 Sample Response:");
    console.log(text.substring(0, 200) + "...");

    return {
      success: true,
      service: "Gemini API",
      status: "Connected",
      model: "gemini-pro",
    };
  } catch (error) {
    console.error("❌ Gemini API Error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

if (require.main === module) {
  testGeminiAPI().then(console.log).catch(console.error);
}
