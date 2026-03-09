import express from "express";
import { createServer as createViteServer } from "vite";
import multer from "multer";
import * as pdfModule from "pdf-parse";
import path from "path";
import { fileURLToPath } from "url";
import { Request, Response } from "express";

const pdf = (pdfModule as any).default || pdfModule;
console.log("pdf-parse import type:", typeof pdf);
if (pdf && typeof pdf === 'object') {
  console.log("pdf-parse keys:", Object.keys(pdf));
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface MulterRequest extends Request {
  file?: Express.Multer.File;
}

async function startServer() {
  console.log("Starting Exam2Excel server...");
  const app = express();
  const PORT = 3000;

  const upload = multer({ storage: multer.memoryStorage() });

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", env: process.env.NODE_ENV });
  });

  // API route for text extraction
  app.post("/api/extract-text", upload.single("file"), async (req: MulterRequest, res: Response) => {
    console.log(`Received ${req.method} request to ${req.url}`);
    try {
      if (!req.file) {
        console.error("No file in request");
        return res.status(400).json({ error: "No file uploaded" });
      }

      console.log(`Processing file: ${req.file.originalname} (${req.file.size} bytes)`);
      let text = "";
      const fileExtension = path.extname(req.file.originalname).toLowerCase();

      if (fileExtension === ".pdf") {
        console.log("Attempting to parse PDF...");
        if (pdf && pdf.PDFParse) {
          console.log("Using PDFParse class (v2.x)");
          const parser = new pdf.PDFParse({ data: req.file.buffer });
          const result = await parser.getText();
          text = result.text;
        } else {
          const pdfFunc = typeof pdf === 'function' ? pdf : pdf.default;
          if (typeof pdfFunc === 'function') {
            console.log("Using pdf-parse function (v1.x)");
            const data = await pdfFunc(req.file.buffer);
            text = data.text;
          } else {
            console.error("pdf-parse import structure:", pdf);
            throw new Error("pdf-parse is not a function or class. Check import.");
          }
        }
      } else {
        console.error(`Unsupported file type: ${fileExtension}`);
        return res.status(400).json({ error: "Unsupported file type. Only PDF is supported." });
      }

      console.log(`Successfully extracted ${text.length} characters`);
      res.json({ text });
    } catch (error) {
      console.error("Extraction error:", error);
      res.status(500).json({ error: "Failed to extract text from file" });
    }
  });

  // Fallback for missing API routes to prevent HTML response
  app.use("/api/*", (req, res) => {
    res.status(404).json({ error: `API route not found: ${req.method} ${req.originalUrl}` });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
