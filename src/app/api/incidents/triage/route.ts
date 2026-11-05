import { NextResponse } from "next/server";
import {
  classifyIncidentWithCalibratedEngine,
  validateModelTriageResponse,
  TriageResult,
} from "@/lib/triage-engine";

/**
 * POST /api/incidents/triage
 *
 * Analyzes incident narrative description and returns intelligent triage recommendations:
 * - Category
 * - Severity (Critical, High, Medium, Low)
 * - Urgency rating
 * - Immediate tactical action
 * - Concise explanation
 * - Calibrated confidence score (strictly null if ambiguous)
 * - Life-safety advisory
 *
 * Uses configured external AI model (with 3000ms timeout boundary & strict schema validation)
 * or seamlessly falls back to the calibrated deterministic emergency NLP engine.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON request body." },
      { status: 400 }
    );
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { success: false, error: "Request payload must be a JSON object." },
      { status: 400 }
    );
  }

  const { description, title } = body as { description?: unknown; title?: unknown };

  if (typeof description !== "string" || !description.trim()) {
    return NextResponse.json(
      { success: false, error: "Incident narrative description is required for triage analysis." },
      { status: 400 }
    );
  }

  const cleanDescription = description.trim();
  const cleanTitle = typeof title === "string" ? title.trim() : undefined;

  let triageResult: TriageResult | null = null;

  // 1. Check if external AI provider is configured in environment
  const geminiApiKey = process.env.GEMINI_API_KEY;

  if (geminiApiKey) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000); // 3-second hard timeout

      const prompt = `You are VIGILORA Emergency Dispatch AI. Analyze this campus incident narrative and output STRICT JSON only:
Title: ${cleanTitle || "N/A"}
Narrative: ${cleanDescription}

Required JSON structure:
{
  "category": "Medical" | "Security" | "Fire and Hazard" | "Crowd Management" | "Suspicious Activity" | "Infrastructure" | "Missing Person",
  "severity": "Critical" | "High" | "Medium" | "Low",
  "urgency": string,
  "immediateAction": string,
  "explanation": string,
  "confidenceScore": number (0.0 to 1.0) or null if ambiguous,
  "isLifeThreatening": boolean,
  "safetyAdvisory": string or null,
  "detectedKeywords": string[]
}`;

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: "application/json",
              temperature: 0.1,
            },
          }),
        }
      );

      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        const candidateText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (candidateText) {
          const parsed = JSON.parse(candidateText);
          triageResult = validateModelTriageResponse(parsed);
        }
      }
    } catch {
      // Any timeout, network error, or invalid JSON falls back gracefully to calibrated engine
      triageResult = null;
    }
  }

  // 2. If external provider unavailable, timed out, or unconfigured, execute calibrated NLP engine
  if (!triageResult) {
    triageResult = classifyIncidentWithCalibratedEngine(cleanDescription, cleanTitle);
  }

  return NextResponse.json({
    success: true,
    data: triageResult,
    disclaimer:
      "AI-Assisted Triage Recommendation • Non-Authoritative Advisory. Final dispatch designation is determined by the operator.",
  });
}

