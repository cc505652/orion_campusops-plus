function normalizeText(s = "") {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function includesAny(text, words) {
  return words.some((w) => text.includes(w));
}

export function autoClassify(title = "", description = "") {
  const text = normalizeText(`${title} ${description}`);

  // ✅ Absolute safety overrides
  if (includesAny(text, ["short circuit", "spark", "sparks", "burning smell", "shock", "fire"])) {
    return { category: "electricity", urgency: "high", reason: "Electrical hazard detected" };
  }
  if (includesAny(text, ["overflow", "flood", "flooding", "burst", "water everywhere"])) {
    return { category: "water", urgency: "high", reason: "Flooding/overflow detected" };
  }

  // ✅ Category rules
  const isWater = includesAny(text, [
    "leak", "leakage", "pipe", "tap", "flush", "bathroom", "washroom",
    "water", "drain", "sewage", "no water"
  ]);

  const isElectric = includesAny(text, [
    "power cut", "electric", "electricity", "fan", "light", "bulb",
    "switch", "socket", "wire", "mcb"
  ]);

  const isWifi = includesAny(text, [
    "wifi", "wi-fi", "internet", "router", "network", "lan", "ping"
  ]);

  const isMess = includesAny(text, [
    "mess", "food", "rotten", "stale", "oil", "uncooked", "hair",
    "insect", "taste", "smell", "dirty plate"
  ]);

  const isMaintenance = includesAny(text, [
    "broken", "repair", "damage", "maintenance", "carpenter",
    "door", "lock", "hinge", "window", "table", "chair", "bed",
    "curtain", "rack"
  ]);

  // Pick category (priority order matters!)
  let category = "other";
  if (isWater) category = "water";
  else if (isElectric) category = "electricity";
  else if (isWifi) category = "wifi";
  else if (isMess) category = "mess";
  else if (isMaintenance) category = "maintenance";

  // ✅ Urgency rules
  let urgency = "medium";

  if (includesAny(text, ["urgent", "immediately", "asap", "danger", "hazard"])) urgency = "high";

  if (category === "electricity" && includesAny(text, ["power cut", "wire", "socket"])) urgency = "high";
  if (category === "water" && includesAny(text, ["leak", "no water"])) urgency = "high";
  if (category === "wifi" && includesAny(text, ["down", "no internet"])) urgency = "high";
  if (category === "mess" && includesAny(text, ["rotten", "stale", "insect", "hair"])) urgency = "high";

  if (includesAny(text, ["minor", "small", "slight", "whenever"])) urgency = "low";

  return { category, urgency, reason: "Rule-based classification" };
}

export function urgencyToScore(urgency) {
  if (urgency === "high") return 3;
  if (urgency === "medium") return 2;
  return 1;
}
