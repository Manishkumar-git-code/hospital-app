import { GoogleGenerativeAI } from "@google/generative-ai";

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-1.5-flash";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

let geminiDisabled = false;

function getClient() {
  if (!GEMINI_API_KEY) return null;
  return new GoogleGenerativeAI(GEMINI_API_KEY);
}

interface SymptomsAnalysis {
  severityScore: number; // 0-100
  priority: "critical" | "high" | "medium" | "low";
  assessment: string;
  recommendedDepartment: string;
  recommendations: string[];
  shouldTransport: boolean;
}

/**
 * Analyze patient symptoms using Gemini API
 * Provides:
 * - Severity score (0-100)
 * - Priority level (critical/high/medium/low)
 * - AI assessment
 * - Recommended hospital department
 * - Safety recommendations
 */
export async function analyzeSymptomsWithAI(symptoms: string): Promise<SymptomsAnalysis | null> {
  try {
    if (!symptoms || !symptoms.trim()) {
      return {
        severityScore: 50,
        priority: "medium",
        assessment: "Symptoms not provided. Please consult with medical staff.",
        recommendedDepartment: "Emergency",
        recommendations: ["Contact medical professional", "Monitor vital signs", "Stay calm"],
        shouldTransport: true,
      };
    }

    if (geminiDisabled) {
      return {
        severityScore: 50,
        priority: "medium",
        assessment: "AI analysis is temporarily unavailable. Please consult with medical staff.",
        recommendedDepartment: "Emergency",
        recommendations: ["Contact medical professional", "Monitor vital signs", "Stay calm"],
        shouldTransport: true,
      };
    }

    const client = getClient();
    if (!client) {
      return {
        severityScore: 50,
        priority: "medium",
        assessment: "AI analysis is not configured. Please consult with medical staff.",
        recommendedDepartment: "Emergency",
        recommendations: ["Contact medical professional", "Monitor vital signs", "Stay calm"],
        shouldTransport: true,
      };
    }

    const model = client.getGenerativeModel({ model: GEMINI_MODEL });

    const prompt = `You are a medical triage AI for an emergency response system. 
    
Analyze the following patient symptoms and provide a JSON response with:
1. severityScore: A number from 0-100 (0=no emergency, 100=life-threatening)
2. priority: One of "critical", "high", "medium", or "low"
3. assessment: A brief medical assessment (1-2 sentences)
4. recommendedDepartment: Suggested hospital department (e.g., ICU, ER, Cardiology)
5. recommendations: Array of 2-3 immediate recommendations for the patient
6. shouldTransport: Boolean indicating if immediate transport is needed

Patient Symptoms: "${symptoms}"

IMPORTANT: Return ONLY valid JSON, no additional text.

Response format:
{
  "severityScore": <number>,
  "priority": "<string>",
  "assessment": "<string>",
  "recommendedDepartment": "<string>",
  "recommendations": ["<string>", "<string>"],
  "shouldTransport": <boolean>
}`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // Parse JSON response
    const analysis = JSON.parse(text) as SymptomsAnalysis;

    // Validate response
    if (
      typeof analysis.severityScore !== "number" ||
      !["critical", "high", "medium", "low"].includes(analysis.priority) ||
      typeof analysis.shouldTransport !== "boolean"
    ) {
      throw new Error("Invalid response format from AI");
    }

    return analysis;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    // Common case: model name not available for user's API/version/plan.
    if (!msg.toLowerCase().includes("is not found")) {
      console.error("Gemini API error:", error);
    } else {
      geminiDisabled = true;
    }
    // Return default analysis on error
    return {
      severityScore: 50,
      priority: "medium",
      assessment: "Unable to analyze symptoms. Please consult with medical staff.",
      recommendedDepartment: "Emergency",
      recommendations: ["Contact medical professional", "Monitor vital signs", "Stay calm"],
      shouldTransport: true,
    };
  }
}

/**
 * Generate medical recommendations based on symptoms
 */
export async function getMedicalRecommendations(symptoms: string): Promise<string[]> {
  try {
    if (!symptoms || !symptoms.trim()) {
      return [
        "Ensure patient is in a safe position",
        "Monitor breathing and consciousness",
        "Keep emergency contact information ready",
        "Do not eat or drink unless instructed",
      ];
    }

    if (geminiDisabled) {
      return [
        "Ensure patient is in a safe position",
        "Monitor breathing and consciousness",
        "Keep emergency contact information ready",
        "Do not eat or drink unless instructed",
      ];
    }

    const client = getClient();
    if (!client) {
      return [
        "Ensure patient is in a safe position",
        "Monitor breathing and consciousness",
        "Keep emergency contact information ready",
        "Do not eat or drink unless instructed",
      ];
    }

    const model = client.getGenerativeModel({ model: GEMINI_MODEL });

    const prompt = `Based on these symptoms: "${symptoms}"
    
Provide 4-5 immediate first aid recommendations as a JSON array of strings.
Return ONLY the JSON array, no additional text.

Example format:
["recommendation 1", "recommendation 2", "recommendation 3"]`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    const recommendations = JSON.parse(text) as string[];
    return recommendations;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (!msg.toLowerCase().includes("is not found")) {
      console.error("Recommendations error:", error);
    } else {
      geminiDisabled = true;
    }
    return [
      "Ensure patient is in a safe position",
      "Monitor breathing and consciousness",
      "Keep emergency contact information ready",
      "Do not eat or drink unless instructed",
    ];
  }
}

/**
 * Assess if symptoms require immediate hospitalization
 */
export async function shouldHospitalize(symptoms: string): Promise<boolean> {
  const analysis = await analyzeSymptomsWithAI(symptoms);
  return analysis?.shouldTransport ?? true;
}

/**
 * Get severity description in plain language
 */
export function getSeverityDescription(score: number): string {
  if (score >= 80) return "Critical - Immediate emergency intervention required";
  if (score >= 60) return "High - Urgent medical attention needed";
  if (score >= 40) return "Medium - Prompt medical evaluation recommended";
  return "Low - Medical evaluation advised";
}
