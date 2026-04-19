const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const generateTemplate = async (prompt, category = 'General', useSpintax = false) => {
    try {
        // Using the user-specified 2.5 model
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

        let spintaxInstruction = "";
        if (useSpintax) {
            spintaxInstruction = `
        - USE SPINTAX FORMAT for greetings, sign-offs, and key action words to ensure variety.
        - Spintax format: {option1|option2|option3}. 
        - Example: "{Hi|Hello|Hey} there! {Check out|Take a look at} our latest offers."
        - Ensure the generated content contains multiple spintax blocks for high randomization.`;
        }

        const systemPrompt = `You are a professional WhatsApp marketing expert. 
        Generate a compelling message template for the following topic: "${prompt}".
        Category: ${category}.
        
        Guidelines:
        - Use emojis to make it engaging.
        - Keep it concise and professional.
        - Use placeholders like {{name}} if applicable.${spintaxInstruction}
        - The response should ONLY contain the message body content. No headers, no "Subject:", just the message itself.`;

        const result = await model.generateContent(systemPrompt);
        const response = await result.response;
        return response.text().trim();
    } catch (error) {
        console.error("AI Generation Error:", error);
        throw new Error("Failed to generate AI content: " + error.message);
    }
};

const generateSmartReply = async ({ context, history, userMessage, businessName }) => {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

        const systemPrompt = `You are "AI Sales Assistant", a polite and professional human-like customer representative for ${businessName || 'our business'}. 
        Your goal is to be helpful, empathetic, and drive sales while maintaining absolute accuracy.

        PERSONA GUIDELINES:
        - Be friendly and use a helpful, natural tone.
        - Use emojis sparingly but appropriately for WhatsApp (😊, ✨, 🛍️).
        - If a customer asks in Bengali or Banglish, reply in the same style/language naturally.
        - Be proactive: if a product is found, suggest a next step (e.g., "Would you like to see the size chart?").
        - If you are unsure or the context doesn't have the answer, respond with: "[HANDOVER] I'm sorry, I'm not quite sure about that specific detail. Let me check with my team and I'll get back to you shortly!"

        CONSTRAINTS:
        - Answer directly using the PROVIDED CONTEXT only.
        - NEVER make up prices, materials, or policies.
        - If the answer isn't in the context, use the [HANDOVER] trigger.
        - Keep responses concise (under 2-3 short paragraphs).

        CONVERSATION HISTORY (Last few messages):
        ${history || 'No previous history.'}

        RELEVANT BUSINESS CONTEXT:
        ${context}

        CUSTOMER'S NEW MESSAGE:
        "${userMessage}"
        
        Answer ONLY with the message to send to the customer.`;

        const result = await model.generateContent(systemPrompt);
        const response = await result.response;
        const textToReturn = response.text().trim();

        // Detect Confidence/Handover trigger
        const isHandover = textToReturn.includes('[HANDOVER]');
        const cleanMessage = textToReturn.replace('[HANDOVER]', '').trim();

        return {
            reply: cleanMessage,
            handover: isHandover
        };
    } catch (error) {
        console.error("AI Smart-Reply Error:", error);
        return { reply: null, handover: true };
    }
};

module.exports = { generateTemplate, generateAutoReply: generateSmartReply };
