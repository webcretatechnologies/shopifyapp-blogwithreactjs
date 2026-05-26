export default class ArticleTemplates {
  static all() {
    return [
      {
        id: "blank",
        name: "Blank template",
        badge: null,
        preview: "/templates/blank.svg",
      },
      {
        id: "faq_product_sidebar",
        name: "FAQ + Sticky product",
        badge: "High conversion",
        preview: "/templates/faq_product_sidebar.svg",
      },
      {
        id: "story_two_images",
        name: "Story + 2 images",
        badge: "Popular",
        preview: "/templates/story_two_images.svg",
      },
      {
        id: "scroll_left_sidebar_products",
        name: "Scroll sections + Left sticky product",
        badge: "New",
        preview: "/templates/scroll_left_sidebar_products.svg",
      },
      {
        id: "scroll_right_switcher_products",
        name: "Sticky product switches on scroll",
        badge: "High conversion",
        preview: "/templates/faq_product_sidebar.svg",
      },
      {
        id: "featured_here_sidebar",
        name: "Featured here (sidebar list)",
        badge: "Storefront style",
        preview: "/templates/faq_product_sidebar.svg",
      },
      {
        id: "expert_review_pro",
        name: "Expert Review Pro",
        badge: "Premium",
        preview: "/templates/blank.svg",
      },
    ];
  }

  static blocks(templateId, data = {}) {
    const img1 = data.image1 || "";
    const img2 = data.image2 || "";
    const title = data.title || "";

    const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2);

    const base = [
      { id: generateId(), type: "heading", data: title, level: 1 },
      { id: generateId(), type: "text", data: "Start writing...\n\n" },
    ];

    if (templateId === "faq_product_sidebar") {
      return [
        ...base,
        {
          id: generateId(),
          type: "product_sidebar",
          title: "Title",
          data: "Description",
        },
      ];
    }

    if (templateId === "story_two_images") {
      return [
        ...base,
        {
          id: generateId(),
          type: "image",
          url: img1,
          alt: "Image 1",
          width: 900,
          height: 420,
          data: "",
        },
        {
          id: generateId(),
          type: "text",
          data: "Add supporting text here...\n\n",
        },
        {
          id: generateId(),
          type: "image",
          url: img2,
          alt: "Image 2",
          width: 900,
          height: 420,
          data: "",
        },
      ];
    }

    if (templateId === "scroll_left_sidebar_products") {
      const section = (title, body) => ({
        id: generateId(),
        type: "product_sidebar",
        side: "left",
        title: title,
        data: body,
      });

      return [
        ...base,
        section("1. Benefit / Point", "Write about your first point here...\n\nThen click 'Select product' and pick a product.\n"),
        section("2. Benefit / Point", "Write about your second point here...\n\nPick a different product for this section.\n"),
        section("3. Benefit / Point", "Write about your third point here...\n\nProduct will change as you scroll.\n"),
        { id: generateId(), type: "heading", data: "Related products", level: 2 },
        { id: generateId(), type: "text", data: "Add related products below (use Product blocks).\n" },
        { id: generateId(), type: "divider", data: "" },
      ];
    }

    if (templateId === "scroll_right_switcher_products") {
      return [
        ...base,
        {
          id: generateId(),
          type: "product_switcher",
          active: 0,
          sections: [
            { id: generateId(), title: "1. First point", body: "Write your first point here...\n\nSelect product for this point.\n", product: null },
            { id: generateId(), title: "2. Second point", body: "Write your second point here...\n\nSelect another product.\n", product: null },
            { id: generateId(), title: "3. Third point", body: "Write your third point here...\n\nProduct changes when this point is visible.\n", product: null },
          ],
        },
        { id: generateId(), type: "heading", data: "Related products", level: 2 },
        { id: generateId(), type: "text", data: "Add related products below (use Product blocks).\n" },
      ];
    }

    if (templateId === "featured_here_sidebar") {
      return [
        ...base,
        {
          id: generateId(),
          type: "featured_product",
          badge: "FEATURED HERE",
          title: "Why the cup matters",
          data: "Write your paragraph here...\n\nThen click Select product and pick the matching product.\n",
        },
        {
          id: generateId(),
          type: "featured_product",
          badge: "FEATURED HERE",
          title: "The pour is the practice",
          data: "Write your paragraph here...\n\nPick a different product for this section.\n",
        },
        {
          id: generateId(),
          type: "featured_product",
          badge: "FEATURED HERE",
          title: "Grinding as ceremony",
          data: "Write your paragraph here...\n\nPick another product.\n",
        },
      ];
    }

    if (templateId === "expert_review_pro") {
      return [
        { id: generateId(), type: "heading", data: "Ultimate Product Review: Is it Worth It?", level: 1 },
        { id: generateId(), type: "text", data: "Today we are taking a deep dive into this amazing product to see if it lives up to the hype...\n\n" },
        {
          id: generateId(),
          type: "table",
          headers: ["Feature", "Specification"],
          rows: [
            ["Material", "Premium Quality"],
            ["Weight", "Lightweight"],
            ["Warranty", "2 Years"],
          ],
        },
        { id: generateId(), type: "heading", data: "Key Features", level: 2 },
        {
          id: generateId(),
          type: "product_switcher",
          active: 0,
          sections: [
            { id: generateId(), title: "Design & Comfort", body: "The ergonomic design ensures you can use this for hours without fatigue.", product: null },
            { id: generateId(), title: "Performance", body: "High-speed processing makes this a top choice for professionals.", product: null },
          ],
        },
        { id: generateId(), type: "text", data: "\nFinal thoughts: This is definitely a must-have for your collection." },
      ];
    }

    return base;
  }
}
