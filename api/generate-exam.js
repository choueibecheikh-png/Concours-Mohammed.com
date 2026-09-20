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
    const { references = [], questionCount = 60 } = req.body || {};

    if (!Array.isArray(references) || references.length === 0) {
      return res.status(400).json({
        error: "اختر ملف PDF واحدًا على الأقل."
      });
    }

    const count = Math.min(Math.max(Number(questionCount) || 60, 10), 60);

    const prompt = `
Tu es un concepteur expert d'examens pour la préparation au concours
d'Inspecteur des Impôts en Mauritanie.

Crée exactement ${count} questions à choix multiple en français, exclusivement
à partir des documents PDF présents dans la base documentaire fournie.

Exigences :
- Répartis les questions entre les thèmes réellement présents dans les documents.
- Ne fabrique aucune information absente des documents.
- Évite les doublons, les questions vagues et les pièges inutiles.
- Chaque question doit avoir 4 choix.
- Certaines questions ont une seule bonne réponse et d'autres plusieurs bonnes réponses.
- Donne une explication courte et exacte pour chaque réponse.
- Attribue un poids positif à chaque question. La somme des poids doit être 20.
- N'affiche pas les points à l'étudiant pendant l'examen.
- Les noms de fichiers choisis par l'étudiant sont : ${references.join(", ")}.

Réponds uniquement avec du JSON valide, sans Markdown, dans ce format exact :
{
  "questions": [
    {
      "text": "Question en français",
      "type": "single",
      "weight": 0.33,
      "options": [
        { "text": "Choix A", "correct": false },
        { "text": "Choix B", "correct": true },
        { "text": "Choix C", "correct": false },
        { "text": "Choix D", "correct": false }
      ],
      "explanation": "Explication courte en français.",
      "sources": ["nom-du-fichier.pdf"]
    }
  ]
}
`;

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4.1",
        input: prompt,
        tools: [
          {
            type: "file_search",
            vector_store_ids: [vectorStoreId]
          }
        ],
        temperature: 0.25
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data?.error?.message || "فشل طلب OpenAI.",
        details: data
      });
    }

    const text = data.output_text;

    if (!text) {
      return res.status(500).json({
        error: "لم يرجع الذكاء الاصطناعي نصًا قابلًا للاستخدام."
      });
    }

    let exam;

    try {
      const cleanText = text
        .replace(/^```json/i, "")
        .replace(/^```/i, "")
        .replace(/```$/i, "")
        .trim();

      exam = JSON.parse(cleanText);
    } catch {
      return res.status(500).json({
        error: "الذكاء الاصطناعي لم يرجع JSON صحيحًا.",
        raw: text
      });
    }

    if (!Array.isArray(exam.questions) || exam.questions.length === 0) {
      return res.status(500).json({
        error: "لم يتم توليد أي أسئلة صحيحة.",
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