/// <reference types="vite/client" />
import { GoogleGenAI } from "@google/genai";

// Fixed: Obtain the API key exclusively from process.env.API_KEY
export const generateDynamicMessage = async (
  contactName: string,
  context: string,
  config: { tone: string; language: string }
): Promise<string> => {
  // Fixed: Obtain the API key from Vite environment variables
  const ai = new GoogleGenAI(import.meta.env.VITE_AI_API_KEY || "");

  const prompt = `Generate a personalized WhatsApp message for ${contactName}. 
  Context/Purpose: ${context}. 
  Tone: ${config.tone}. 
  Language: ${config.language}.
  Keep it concise and engaging. Do not include subject lines or formal email headers. Just the message body.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        temperature: 0.7,
        topP: 0.8,
        topK: 40
      }
    });

    // Extract text output directly from the .text property
    return response.text?.trim() || "Failed to generate message.";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Error generating message. Please try again.";
  }
};
