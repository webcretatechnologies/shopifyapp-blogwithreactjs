import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seed() {
  console.log("Starting analytics seed...");
  
  // Find a shop and some posts
  const posts = await prisma.post.findMany({ take: 5 });
  if (posts.length === 0) {
    console.log("No posts found. Please create some posts first.");
    process.exit(1);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let totalSeeded = 0;

  for (const post of posts) {
    // Generate data for the last 30 days
    for (let i = 0; i < 30; i++) {
      const date = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
      
      // Randomize traffic (more recent = more traffic)
      const baseTraffic = Math.floor(Math.random() * 50) + (30 - i) * 2;
      if (baseTraffic === 0 && Math.random() > 0.5) continue;
      
      const views = baseTraffic;
      const uniqueVisitors = Math.floor(views * (0.6 + Math.random() * 0.3)); // 60-90% unique
      
      const deviceDesktop = Math.floor(views * 0.4);
      const deviceMobile = Math.floor(views * 0.5);
      const deviceTablet = views - deviceDesktop - deviceMobile;
      
      const addToCart = Math.floor(views * (0.05 + Math.random() * 0.1)); // 5-15% add to cart
      const checkouts = Math.floor(addToCart * (0.4 + Math.random() * 0.4)); // 40-80% of carts checkout
      const conversions = Math.floor(checkouts * (0.5 + Math.random() * 0.3)); // 50-80% of checkouts convert
      const revenue = conversions * (20 + Math.random() * 80); // $20-$100 per conversion
      
      const sources = JSON.stringify({
        google: Math.floor(views * 0.4),
        facebook: Math.floor(views * 0.2),
        direct: Math.floor(views * 0.2),
        twitter: Math.floor(views * 0.1),
        other: views - Math.floor(views * 0.9)
      });
      
      const countries = JSON.stringify({
        US: Math.floor(views * 0.6),
        CA: Math.floor(views * 0.1),
        GB: Math.floor(views * 0.1),
        AU: Math.floor(views * 0.1),
        IN: views - Math.floor(views * 0.9)
      });

      await prisma.postAnalytic.upsert({
        where: { postId_date: { postId: post.id, date } },
        update: {
          views,
          uniqueVisitors,
          deviceDesktop,
          deviceMobile,
          deviceTablet,
          addToCart,
          checkouts,
          conversions,
          revenue,
          sources,
          countries
        },
        create: {
          postId: post.id,
          date,
          views,
          uniqueVisitors,
          deviceDesktop,
          deviceMobile,
          deviceTablet,
          addToCart,
          checkouts,
          conversions,
          revenue,
          sources,
          countries
        }
      });
      totalSeeded++;
    }
  }
  
  console.log(`Successfully seeded ${totalSeeded} days of analytics data across ${posts.length} posts!`);
  await prisma.$disconnect();
}

seed().catch(e => {
  console.error(e);
  process.exit(1);
});
