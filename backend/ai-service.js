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

const generateAutoReply = async (context, userMessage) => {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

        const systemPrompt = `You are a helpful and professional customer service AI for an e-commerce business.
        Answer the customer's question thoughtfully directly using the provided context. Do NOT make up prices, policies, or products.
        Keep your response concise, polite, and WhatsApp-friendly (use some emojis).

        CONTEXT:
        ${context}

        CUSTOMER MESSAGE:
        "${userMessage}"
        
        Answer ONLY with the message to send to the customer.`;

        const result = await model.generateContent(systemPrompt);
        const response = await result.response;
        return response.text().trim();
    } catch (error) {
        console.error("AI Auto-Reply Error:", error);
        return null;
    }
};

module.exports = { generateTemplate, generateAutoReply };
