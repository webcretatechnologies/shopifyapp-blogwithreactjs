import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const post = await prisma.post.findFirst({
    where: { title: { contains: "ABC Template" } }
  });
  if (post) {
    const html = `
      <p>The Shravan month is named after the Shravan Nakshatra, the star formation that governs the sky on the full-moon day. Its dedication to Lord Shiva traces back to the Samudra Manthan, when the churning of the cosmic ocean released the deadly Halahala poison. Shiva drank it to protect creation, and the poison turned his throat blue - earning him the name Neelkanth. To this day, devotees perform <strong>jal abhishek</strong> - pouring water, milk, and Gangajal over the Shivling - as a symbolic re-enactment of cooling that divine sacrifice.</p>
      
      <h2>Sawan Somvar 2026: Full Puja Calendar</h2>
      <p>In North India, the four Sawan Somvars (Shravan Mondays) in 2026 fall on 3, 10, 17 and 24 August - the most important fasting and worship days of the entire month.</p>
      
      <table>
        <tr>
          <th>Date (2026)</th>
          <th>Day</th>
          <th>Occasion</th>
          <th>Significance</th>
        </tr>
        <tr>
          <td>3 August</td>
          <td>Monday</td>
          <td>1st Sawan Somvar</td>
          <td>First Monday fast; ideal day to begin Solah Somvar Vrat.</td>
        </tr>
        <tr>
          <td>9 August</td>
          <td>Sunday</td>
          <td>Kamika Ekadashi</td>
          <td>Fasting for forgiveness and prosperity.</td>
        </tr>
        <tr>
          <td>10 August</td>
          <td>Monday</td>
          <td>2nd Sawan Somvar</td>
          <td>Shivling abhishek with milk and bel patra.</td>
        </tr>
        <tr>
          <td>11-12 August</td>
          <td>Tue-Wed</td>
          <td>Sawan Shivratri & Hariyali Amavasya</td>
          <td>Night-long Shiva worship; new moon rituals.</td>
        </tr>
        <tr>
          <td>15 August</td>
          <td>Saturday</td>
          <td>Hariyali Teej</td>
          <td>Married women pray for marital wellbeing; coincides with Independence Day.</td>
        </tr>
        <tr>
          <td>17 August</td>
          <td>Monday</td>
          <td>3rd Sawan Somvar + Nag Panchami</td>
          <td>A rare overlap - snake-deity worship falls on a Shiva Monday.</td>
        </tr>
        <tr>
          <td>23 August</td>
          <td>Sunday</td>
          <td>Putrada Ekadashi</td>
          <td>Fasting for the wellbeing of children.</td>
        </tr>
        <tr>
          <td>24 August</td>
          <td>Monday</td>
          <td>4th Sawan Somvar</td>
          <td>Final Monday fast of the North Indian calendar.</td>
        </tr>
        <tr>
          <td>28 August</td>
          <td>Friday</td>
          <td>Shravan Purnima / Raksha Bandhan</td>
          <td>Month concludes; sibling festival celebrated.</td>
        </tr>
      </table>
      
      <p>Tithi timings can shift by a day depending on your city's sunrise - always cross-check with your local panchang before finalising your vrat dates.</p>
      
      <h2>Why Shravan Matters: Facts Behind the Rituals</h2>
      <p>More text...</p>
    `;
    
    await prisma.post.update({
      where: { id: post.id },
      data: {
        contentHtml: html,
        contentJson: [] // Clear JSON so importer runs again!
      }
    });
    console.log("Fixed ABC Template!");
  } else {
    console.log("Post not found");
  }
}
main().finally(() => prisma.$disconnect());
