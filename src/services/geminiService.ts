import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";
import { ExamQuestion } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

// Retry helper with exponential backoff
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  let lastError: any;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      const isQuotaError = error?.message?.includes("429") || error?.message?.includes("RESOURCE_EXHAUSTED");
      if (isQuotaError && i < maxRetries - 1) {
        const delay = Math.pow(2, i) * 2000 + Math.random() * 1000;
        console.warn(`Quota exceeded. Retrying in ${Math.round(delay)}ms... (Attempt ${i + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

export async function parseExamFile(file: File): Promise<ExamQuestion[]> {
  const model = "gemini-3-flash-preview";
  
  // Convert file to base64
  const base64Data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const prompt = `
    Extract ALL multiple-choice questions from the attached document. 
    
    THINKING PROCESS:
    1. Scan the document for question numbers (e.g., "1.", "(5).", "12)").
    2. Extract the question text.
    3. Locate the four options (A, B, C, D). They may be on the same line, separate lines, or in columns.
    4. YOU MUST FIND ALL FOUR OPTIONS. If you only see two, keep looking in the surrounding area.
    5. LAYOUT AWARENESS: Technical exams often use grids or columns. 
       - If you see "A." and "C." on one line, and "B." and "D." on the next, they are likely in two columns.
       - DO NOT stop until you have found A, B, C, and D.
    6. Identify which option is BOLDED (or uses bold Unicode like 𝟏).
    7. Convert all math/symbols to LaTeX.

    CRITICAL ACCURACY INSTRUCTION: 
    - The correct answers are indicated EXCLUSIVELY by BOLD text in the document. 
    - For every single question, you must identify which of the four options (A, B, C, or D) is BOLDED.
    - Bolding may appear as standard bolding OR as mathematical bold Unicode characters (e.g., 𝟏, 𝟐, 𝐀, 𝐁, 𝛀).
    - If "A. [Text]" is bold, the answer is "A".
    - If only the text "[Text]" is bold but the letter "A." is not, the answer is still "A".
    - You MUST NOT guess. You must visually verify the bolding.
    - Ensure the 'answer' field contains only the letter (A, B, C, or D).

    LATEX & SYMBOLS INSTRUCTION:
    - Prefer literal Unicode symbols (Ω, π, θ, ±, °, etc.) for simple symbols and units.
    - Use LaTeX ($...$) ONLY for complex mathematical formulas, fractions, or equations that cannot be represented by simple Unicode.
    - For subscripts and superscripts, ALWAYS use LaTeX like $R_L$ or $x^2$. This is critical for technical accuracy.
    - If an option contains a fraction represented by "/", ensure it is clearly extracted. If the user requested a line separator for "/", use the literal "/" but ensure the context is clear.
    - Examples: 
      - Ohm: Ω
      - Percent: %
      - Degree: °
      - Equation: $10 \cos(\omega t + 53.13^\circ)$ (Use LaTeX for complex expressions)
      - Subscripts: $R_L$, $C_1$
      - Superscripts: $x^2$
    - This ensures the data is readable in both the app and Excel.
    - Ensure LaTeX is valid and readable.

    UNIT INHERITANCE RULE (CRITICAL):
    - If the question asks for a quantity IN a specific unit (e.g., "find the resistance in ohms", "what is the impedance in Ω", "solve for voltage in V"), then EVERY answer option that is a bare number MUST include that unit.
    - Examples:
      - Question: "Find the equivalent resistance in ohms." Options: "100", "200", "500", "1000" → MUST become "100 Ω", "200 Ω", "500 Ω", "1000 Ω".
      - Question: "What is the voltage in volts?" Options: "12", "24" → MUST become "12 V", "24 V".
    - This rule applies to ALL questions, not just specific ones.
    - Never leave a bare number as an answer option when the question clearly specifies a unit.

    STRICT OPTION CONTENT RULE:
    - "option1" MUST contain the full text content of Option A.
    - "option2" MUST contain the full text content of Option B.
    - "option3" MUST contain the full text content of Option C.
    - "option4" MUST contain the full text content of Option D.
    - DO NOT just put the letter "A." or "B." etc. in the option fields. Put the actual content that follows the letter.
    - If an option is "A. 10 ohms", then option1 should be "10 ohms" (or "$10 \Omega$").
    - If you see "A.", "B.", "C.", "D." but no text immediately after them, look at the next line or in the next column. Technical exams often use multi-column layouts.

    COMPLETENESS INSTRUCTION:
    - Every question MUST have all four options (A, B, C, D) extracted.
    - YOU ARE FORBIDDEN FROM RETURNING "n/a", "missing", "none", or empty strings for options.
    - If you cannot find an option, DO NOT skip it. Look further in the document. It might be in a separate column or on the next page.
    - Technical exams often use a 2x2 grid for options:
      Row 1: A. [Text]   C. [Text]
      Row 2: B. [Text]   D. [Text]
      In this case, make sure you don't miss C and D.
    - Even if options contain complex symbols, they MUST be extracted completely using LaTeX or the literal symbol.
    - Some question numbers may be in parentheses like "(5)." or "(12).". These MUST be included.
    - Options might be on the same line (e.g., "A. 1 B. 2 C. 3 D. 4"). You MUST split them.
    - For EVERY question without exception, ensure options are NOT blank and that all symbols (Ω, °, V, A, Hz, etc.) are preserved and units are inherited from the question stem into bare-number options.

    SYMBOL INSTRUCTION:
    - Use the literal symbols (Ω, %, °, etc.) or LaTeX ($...$) for mathematical expressions.
    - Do NOT write out the names of symbols (e.g., do not write "omega", write "$\omega$" or "ω").

    EXAMPLE OF TECHNICAL EXTRACTION:
    Input: "(42). Transform the current given by 6 + 𝑗8 𝐴 to its time domain. A. 100 𝑐𝑜𝑠 (𝜔𝑡 + 53.13°) B. 𝟏𝟎 𝒄𝒐𝒔 (𝝎𝒕 + 𝟓𝟑.𝟏𝟑°) C. 100 𝑐𝑜𝑠 (𝜔𝑡 + 36.87°) D. 10 𝑐𝑜𝑠 (𝜔𝑡 + 36.87°)"
    Output: { "questionNo": "42", "question": "Transform the current given by $6 + j8 A$ to its time domain.", "option1": "$100 \cos(\omega t + 53.13^\circ)$", "option2": "$10 \cos(\omega t + 53.13^\circ)$", "option3": "$100 \cos(\omega t + 36.87^\circ)$", "option4": "$10 \cos(\omega t + 36.87^\circ)$", "answer": "B" }

    Return an array of objects with these exact keys:
    - questionNo: The number of the question (e.g., "1", "5", "12")
    - question: The full text of the question
    - option1: Option A
    - option2: Option B
    - option3: Option C
    - option4: Option D
    - answer: The correct answer letter (A, B, C, or D) identified by BOLDING.

    Clean up headers/footers. Maintain math symbols/units.
  `;

  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model,
      contents: [
        {
          parts: [
            {
              inlineData: {
                mimeType: file.type || 'application/pdf',
                data: base64Data
              }
            },
            {
              text: prompt
            }
          ]
        }
      ],
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              questionNo: { type: Type.STRING },
              question: { type: Type.STRING },
              option1: { type: Type.STRING },
              option2: { type: Type.STRING },
              option3: { type: Type.STRING },
              option4: { type: Type.STRING },
              answer: { type: Type.STRING },
            },
            required: ["questionNo", "question", "option1", "option2", "option3", "option4", "answer"],
          },
        },
      },
    });

    try {
      let jsonStr = response.text || "[]";
      jsonStr = jsonStr.replace(/^```json\n?/, "").replace(/\n?```$/, "").trim();
      return JSON.parse(jsonStr);
    } catch (e) {
      console.error("Failed to parse Gemini response:", e);
      return [];
    }
  });
}
