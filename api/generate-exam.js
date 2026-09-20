export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  const vectorStoreId = process.env.OPENAI_VECTOR_STORE_ID;

  if (!apiKey) {
    return res.status(500).json({
      error: "مفتاح OPENAI_API_KEY غير موجود في إعدادات Vercel."
    });
  }

  if (!vectorStoreId) {
    return res.status(500).json({
      error: "معرف OPENAI_VECTOR_STORE_ID غير موجود في إعدادات Vercel."
    });
  }

  try {
    const { questionCount = 60 } = req.body || {};
    const count = Math.min(Math.max(Number(questionCount) || 60, 10), 60);

    const prompt = `
Tu es un concepteur expert d'examens pour la préparation au concours
d'Inspecteur des Impôts en Mauritanie.

Utilise exclusivement les informations trouvées dans les documents de la
base documentaire via l'outil file_search. Crée exactement ${count} questions
à choix multiple en français.

Exigences :
- Répartis les questions entre les thèmes réellement présents dans les documents.
- N'invente aucune information qui n'est pas dans les documents.
- Évite les doublons, les questions vagues et les pièges inutiles.
- Chaque question contient exactement 4 choix.
- "type" doit valoir "single" pour une seule bonne réponse, ou "multiple"
  lorsqu'il y a plusieurs bonnes réponses.
- Donne une explication courte, précise et fondée sur les documents.
- Ajoute dans "sources" le nom du ou des PDF utilisés.
- Donne un poids positif à chaque question, avec un total de 20 points.
- N'affiche jamais les points à l'étudiant pendant l'examen.
`;

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4.1",
        input: prompt,
        tools: [
          {
            type: "file_search",
            vector_store_ids: [vectorStoreId],
            max_num_results: 20
          }
        ],
        text: {
          format: {
            type: "json_schema",
            name: "exam_questions",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["questions"],
              properties: {
                questions: {
                  type: "array",
                  minItems: count,
                  maxItems: count,
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: [
                      "text",
                      "type",
                      "weight",
                      "options",
                      "explanation",
                      "sources"
                    ],
                    properties: {
                      text: { type: "string" },
                      type: {
                        type: "string",
                        enum: ["single", "multiple"]
                      },
                      weight: { type: "number", exclusiveMinimum: 0 },
                      options: {
                        type: "array",
                        minItems: 4,
                        maxItems: 4,
                        items: {
                          type: "object",
                          additionalProperties: false,
                          required: ["text", "correct"],
                          properties: {
                            text: { type: "string" },
                            correct: { type: "boolean" }
                          }
                        }
                      },
                      explanation: { type: "string" },
                      sources: {
                        type: "array",
                        minItems: 1,
                        items: { type: "string" }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        temperature: 0.2
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data?.error?.message || "فشل طلب OpenAI.",
        details: data
      });
    }

    if (!data.output_text) {
      return res.status(500).json({
        error: "لم يرجع الذكاء الاصطناعي نصًا قابلًا للاستخدام."
      });
    }

    let exam;
    try {
      exam = JSON.parse(data.output_text);
    } catch {
      return res.status(500).json({
        error: "تعذر قراءة بيانات الامتحان التي تم إنشاؤها.",
        raw: data.output_text
      });
    }

    if (!Array.isArray(exam.questions) || exam.questions.length !== count) {
      return res.status(500).json({
        error: "عدد الأسئلة الناتج غير صحيح.",
        raw: exam
      });
    }

    return res.status(200).json({
      ok: true,
      questions: exam.questions
    });
  } catch (error) {
    return res.status(500).json({
      error: "حدث خطأ داخلي أثناء إنشاء الامتحان.",
      details: error.message
    });
  }
}