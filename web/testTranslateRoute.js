import { PrismaClient } from "@prisma/client";
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const prisma = new PrismaClient();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function run() {
  const post = await prisma.post.findFirst({
    where: { title: { contains: "Test Template" } }
  });
  
  if (!post) {
    console.log("Post not found");
    return;
  }

  const sourceData = {
    title: post.title || "",
    excerpt: post.excerpt || "",
    contentHtml: post.contentHtml || "",
    metaTitle: post.metaTitle || "",
    metaDescription: post.metaDescription || "",
  };

  const translateScriptPath = path.join(__dirname, "../translate.py");
  console.log("Path:", translateScriptPath);

  const pythonProcess = spawn("python3", [translateScriptPath, "gu"]);

  let outputData = "";
  let errorData = "";

  pythonProcess.stdout.on("data", (data) => {
    outputData += data.toString();
  });

  pythonProcess.stderr.on("data", (data) => {
    errorData += data.toString();
  });

  pythonProcess.stdin.write(JSON.stringify(sourceData));
  pythonProcess.stdin.end();

  const startTime = Date.now();
  await new Promise((resolve, reject) => {
    pythonProcess.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Python process exited with code ${code}: ${errorData}`));
      } else {
        resolve(outputData);
      }
    });
  });

  console.log("Time taken:", (Date.now() - startTime) / 1000, "seconds");
  if (errorData) {
    console.log("Error:", errorData);
  }
  console.log("Output parsed correctly?", !!JSON.parse(outputData));
}

run().catch(console.error).finally(() => process.exit(0));
