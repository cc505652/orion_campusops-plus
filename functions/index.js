const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

const { GoogleGenerativeAI } = require("@google/generative-ai");

exports.generateWeeklySummary = functions
  .region("asia-south1")
  .https.onCall(async (data, context) => {
    // ✅ optional: require login
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Login required");
    }

    const GEMINI_KEY = functions.config().gemini.key;
    if (!GEMINI_KEY) {
      throw new functions.https.HttpsError("failed-precondition", "Gemini API key missing");
    }

    // Fetch last 7 days issues
    const sevenDaysAgo = admin.firestore.Timestamp.fromMillis(
      Date.now() - 7 * 24 * 60 * 60 * 1000
    );

    const snap = await admin
      .firestore()
      .collection("issues")
      .where("createdAt", ">", sevenDaysAgo)
      .orderBy("createdAt", "desc")
      .limit(200)
      .get();

    const issues = snap.docs.map((d) => d.data());

    // Minimal structured payload
    const payload = issues.map((i) => ({
      title: i.title,
      category: i.category,
      urgency: i.urgency,
      status: i.status,
      location: i.location,
      assignedTo: i.assignedTo || null
    }));

    const genAI = new GoogleGenerativeAI(GEMINI_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `
You are an ops analyst for a residential campus issue tracking system.
Analyze the issue data and generate a weekly operations report.

Return output in this exact format:

1) Key Trends (3 bullets)
2) Hotspots (top 3 locations)
3) SLA & Delays (insights)
4) Category Breakdown (water/electricity/wifi/mess/maintenance)
5) Action Recommendations (3 bullets)

Data (JSON):
${JSON.stringify(payload)}
`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    return { summary: text, count: payload.length };
  });
