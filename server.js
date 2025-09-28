require('dotenv').config();
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { DocumentProcessorServiceClient } = require('@google-cloud/documentai').v1;

const app = express();
const upload = multer({ dest: 'uploads/' });
const PORT = process.env.PORT || 3000;

const client = new DocumentProcessorServiceClient({
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
});

app.use(express.static(path.join(__dirname, 'public')));

app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const filePath = path.resolve(req.file.path);
    const mimeType = req.file.mimetype || 'application/pdf';

    const fileBuffer = fs.readFileSync(filePath);
    const encoded = fileBuffer.toString('base64');

    const projectId = process.env.GCP_PROJECT_ID;
    const location = process.env.DOCUMENT_AI_LOCATION || 'us';
    const processorId = process.env.DOCUMENT_AI_PROCESSOR_ID;

    if (!projectId || !processorId) {
      return res.status(500).json({ error: 'Missing Document AI configuration in .env' });
    }

    const name = `projects/${projectId}/locations/${location}/processors/${processorId}`;

    const request = {
      name,
      rawDocument: {
        content: encoded,
        mimeType,
      },
    };

    // ✅ Now inside async function → await is valid
    const [result] = await client.processDocument(request);

    const doc = result.document || {};
    const fullText = doc.text || '';
    const pages = (doc.pages || []).map((p, idx) => ({ pageNumber: idx + 1, blocks: p.blocks ? p.blocks.length : 0 }));
    const entities = (doc.entities || []).map(e => ({ type: e.type, mentionText: e.mentionText, confidence: e.confidence }));

    fs.unlinkSync(filePath);

    return res.json({ ok: true, text: fullText, pages, entities, raw: result });
  } catch (err) {
    console.error('Error processing document:', err);
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    return res.status(500).json({ error: err.message || String(err) });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
