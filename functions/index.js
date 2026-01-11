const admin = require("firebase-admin");
admin.initializeApp();

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const { defineSecret } = require("firebase-functions/params");
const { GoogleGenerativeAI } = require("@google/generative-ai");

setGlobalOptions({ region: "asia-south1" });

// ✅ define secret
const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");

exports.generateAiOpsNarration = onCall(
  {
    timeoutSeconds: 60,
    memory: "256MiB",
    secrets: [GEMINI_API_KEY] // ✅ attach secret
  },
  async (request) => {
    try {
      if (!request.auth) {
        throw new HttpsError("unauthenticated", "Login required");
      }

      const stats = request.data?.stats;
      if (!stats) {
        throw new HttpsError("invalid-argument", "stats missing");
      }

      const key = GEMINI_API_KEY.value();
      if (!key) {
        throw new HttpsError("failed-precondition", "Gemini API key secret missing");
      }

      const genAI = new GoogleGenerativeAI(key);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

      const prompt = `
You are writing a weekly operations report for a residential campus issue management system.

CRITICAL RULES:
- Use ONLY the numbers provided in the JSON.
- Do NOT invent or estimate any numbers.
- Do NOT add new metrics.

Write:
1) Key Insights (3 bullets)
2) Hotspots explanation (short)
3) SLA improvement plan (3 bullets)
4) Action Recommendations (3 bullets)

Stats JSON:
${JSON.stringify(stats)}
`;

      const result = await model.generateContent(prompt);
      const text = result.response.text();

      return { narration: text };
    } catch (err) {
      console.error("AI narration function failed:", err);

      // already a proper callable error?
      if (err?.code) throw err;

      throw new HttpsError("internal", err?.message || "Unknown backend error");
    }
  }
);
