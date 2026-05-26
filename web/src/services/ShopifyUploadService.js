import fs from "fs";
import fetch from "node-fetch";

export async function uploadToShopify(shopDomain, accessToken, filePath, mimeType, filename) {
  // 1. Create Staged Upload
  const stagedQuery = `
    mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets {
          url
          resourceUrl
          parameters { name value }
        }
        userErrors { field message }
      }
    }
  `;
  
  const fileSize = fs.statSync(filePath).size.toString();
  
  const stagedRes = await fetch(`https://${shopDomain}/admin/api/2024-01/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken,
    },
    body: JSON.stringify({
      query: stagedQuery,
      variables: {
        input: [{
          resource: "FILE",
          filename: filename,
          mimeType: mimeType,
          fileSize: fileSize,
          httpMethod: "POST"
        }]
      }
    })
  });
  
  const stagedData = await stagedRes.json();
  const target = stagedData.data?.stagedUploadsCreate?.stagedTargets?.[0];
  if (!target) throw new Error("Failed to create staged upload");
  
  // 2. Upload file to Staged Target
  const formData = new FormData();
  target.parameters.forEach(p => formData.append(p.name, p.value));
  
  // Need to read file as blob/buffer for FormData
  const { Blob } = await import("node:buffer");
  const fileBuffer = fs.readFileSync(filePath);
  formData.append("file", new Blob([fileBuffer], { type: mimeType }), filename);
  
  const uploadRes = await fetch(target.url, {
    method: "POST",
    body: formData
  });
  
  if (!uploadRes.ok) {
     const text = await uploadRes.text();
     throw new Error(`Failed to upload to target: ${text}`);
  }
  
  // 3. Create File in Shopify
  const createQuery = `
    mutation fileCreate($files: [FileCreateInput!]!) {
      fileCreate(files: $files) {
        files {
          id
          fileStatus
          ... on GenericFile { url }
          ... on MediaImage { image { url } }
        }
        userErrors { field message }
      }
    }
  `;
  
  const createRes = await fetch(`https://${shopDomain}/admin/api/2024-01/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken,
    },
    body: JSON.stringify({
      query: createQuery,
      variables: {
        files: [{
          originalSource: target.resourceUrl,
          contentType: "IMAGE",
        }]
      }
    })
  });
  
  const createData = await createRes.json();
  const file = createData.data?.fileCreate?.files?.[0];
  if (!file) throw new Error("Failed to register file with Shopify");
  
  // Return the resourceUrl or the final url if available immediately
  // Note: Shopify processes files asynchronously, so url might be null immediately.
  // We can return target.url or resourceUrl as a fallback? 
  // No, resourceUrl is an internal key.
  // Actually, MediaImage might have url null initially. Let's just poll or return a placeholder?
  // Or just return the local file URL temporarily until Shopify syncs?
  
  return file.image?.url || file.url || null;
}
