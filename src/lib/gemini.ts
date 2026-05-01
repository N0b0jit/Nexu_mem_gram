import { GoogleGenAI } from "@google/genai";

let aiInstance: GoogleGenAI | null = null;

const getAI = () => {
  if (!aiInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not defined");
    }
    aiInstance = new GoogleGenAI({ apiKey });
  }
  return aiInstance;
};

export async function analyzeImage(imageUrl: string, prompt: string = "Analyze this image fragment. What do you see? Provide a concise summary and list key objects or text found.") {
  try {
    const ai = getAI();
    
    // Fetch the image and convert to base64
    const response = await fetch(imageUrl);
    const blob = await response.blob();
    const base64Data = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = (reader.result as string).split(',')[1];
        resolve(base64);
      };
      reader.readAsDataURL(blob);
    });

    const result = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: {
        parts: [
          {
            inlineData: {
              data: base64Data,
              mimeType: blob.type || "image/jpeg"
            }
          },
          {
            text: prompt
          }
        ]
      }
    });

    return result.text;
  } catch (error: any) {
    console.error("Gemini Analysis Error:", error);
    throw error;
  }
}
