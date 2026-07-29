import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const post = await prisma.post.findFirst({
    where: { title: { contains: "ABC" } }
  });
  if (post) {
    const newHtml = `
      <h2>Table 1: Simple Table (Should become Table block)</h2>
      <table>
        <tr>
          <th>Region</th>
          <th>Start Date</th>
        </tr>
        <tr>
          <td>North India</td>
          <td>July 30</td>
        </tr>
      </table>

      <h2>Table 2: Complex Table with links (Should flag for review and become Html block)</h2>
      <table>
        <tr>
          <th>Occasion</th>
          <th>Product</th>
        </tr>
        <tr>
          <td>Morning Puja</td>
          <td><a href="https://example.com">Sandalwood Agarbatti</a></td>
        </tr>
      </table>
      
      <h2>Table 3: Complex Table with rowspan (Should flag for review and become Html block)</h2>
      <table>
        <tr>
          <th rowspan="2">Do's</th>
          <th>Don'ts</th>
        </tr>
        <tr>
          <td>Don't do this</td>
        </tr>
      </table>
    `;
    
    await prisma.post.update({
      where: { id: post.id },
      data: {
        contentHtml: newHtml,
        contentJson: []
      }
    });
    console.log("Updated post to have fresh tables and cleared AST for re-import.");
  }
}
main().finally(() => prisma.$disconnect());
