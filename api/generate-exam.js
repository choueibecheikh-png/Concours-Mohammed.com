export default function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  const { references } = req.body || {};

  if (!Array.isArray(references) || references.length === 0) {
    return res.status(400).json({
      error: "اختر ملف PDF واحدًا على الأقل."
    });
  }

  return res.status(200).json({
    ok: true,
    message: "تم استقبال الملفات المختارة بنجاح.",
    references: references,
    nextStep: "سيتم في الخطوة القادمة استخراج نص PDF وتوليد أسئلة الامتحان."
  });
}