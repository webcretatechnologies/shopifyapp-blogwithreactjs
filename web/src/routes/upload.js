import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import shopify from "../../shopify.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = express.Router();

const storage = multer.diskStorage({
  destination: path.join(__dirname, "../../public/uploads"),
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

router.post("/", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file provided" });

  try {
    const session = res.locals.shopify?.session;
    if (session) {
      const client = new shopify.api.clients.Graphql({ session });
      
      const stagedQuery = `
        mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
          stagedUploadsCreate(input: $input) {
            stagedTargets { url resourceUrl parameters { name value } }
            userErrors { field message }
          }
        }
      `;
      const stagedData = await client.request(stagedQuery, {
        variables: {
          input: [{
            resource: "IMAGE",
            filename: req.file.originalname,
            mimeType: req.file.mimetype,
            fileSize: req.file.size.toString(),
            httpMethod: "POST"
          }]
        }
      });
      
      const target = stagedData.data.stagedUploadsCreate.stagedTargets[0];
      
      if (target) {
        const formData = new FormData();
        target.parameters.forEach(p => formData.append(p.name, p.value));
        const { Blob } = await import("node:buffer");
        const fileBuffer = fs.readFileSync(req.file.path);
        formData.append("file", new Blob([fileBuffer], { type: req.file.mimetype }), req.file.originalname);
        
        await fetch(target.url, { method: "POST", body: formData });
        
        const createQuery = `
          mutation fileCreate($files: [FileCreateInput!]!) {
            fileCreate(files: $files) {
              files { id ... on MediaImage { image { url } } }
              userErrors { field message }
            }
          }
        `;
        const createData = await client.request(createQuery, {
          variables: {
            files: [{ originalSource: target.resourceUrl, contentType: "IMAGE" }]
          }
        });
        
        let fileObj = createData.data.fileCreate.files[0];
        let finalUrl = fileObj?.image?.url;
        
        // Poll up to 5 times (5 seconds)
        let attempts = 0;
        while (!finalUrl && attempts < 5 && fileObj?.id) {
          await new Promise(r => setTimeout(r, 1000));
          const pollQuery = `query { node(id: "${fileObj.id}") { ... on MediaImage { image { url } } } }`;
          const pollData = await client.request(pollQuery);
          finalUrl = pollData.data.node?.image?.url;
          attempts++;
        }
        
        if (finalUrl) {
           fs.unlinkSync(req.file.path);
           return res.json({ url: finalUrl });
        }
      }
    }
  } catch (e) {
    console.error("Shopify Direct Upload failed, falling back to local storage:", e);
  }

  res.json({ url: `/uploads/${req.file.filename}` });
});

export default router;
