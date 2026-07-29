import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
  const existingPost = await prisma.post.findFirst();
  if (!existingPost) {
    console.log("No existing posts found to copy IDs from");
    return;
  }
  
  const newHtml = `
    <h2>Test 1: Simple Calendar Table (Should become Table Block)</h2>
    <table>
      <tr>
        <th>Region</th>
        <th>Start Date</th>
        <th>End Date</th>
      </tr>
      <tr>
        <td>North India (UP, Bihar, Rajasthan)</td>
        <td>Thursday, 30 July 2026</td>
        <td>Friday, 28 August 2026</td>
      </tr>
    </table>

    <h2>Test 2: Complex Table with Links (Should become Html Block + Callout)</h2>
    <table>
      <tr>
        <th>Occasion</th>
        <th>Product</th>
        <th>Significance</th>
      </tr>
      <tr>
        <td>Morning Shivling Abhishek</td>
        <td><a href="https://example.com/sandalwood">Sandalwood (चंदन) Agarbatti Incense Sticks</a></td>
        <td>Grounding, calming aroma</td>
      </tr>
    </table>
  `;
  
  const post = await prisma.post.create({
    data: {
      title: "Table Importer Test",
      slug: "table-importer-test-" + Date.now(),
      status: "draft",
      contentHtml: newHtml,
      contentJson: "[]",
      editorMode: "builder",
      shopId: existingPost.shopId,
      categoryId: existingPost.categoryId
    }
  });
  console.log("Created test post with ID:", post.id);
}
run().finally(() => prisma.$disconnect());
