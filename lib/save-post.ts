import { prisma } from "./prisma";

export async function savePostToDb(data: any) {
  const { post, sections, images, internal_links, keywords, categories, products } = data;
  return await prisma.post.create({
    data: {
      title: post.title,
      slug: post.slug,
      meta_description: post.meta_description,
      featured_image_prompt: post.featured_image_prompt,
      featured_image_url: post.featured_image_url,
      reading_time: String(post.reading_time),
      status: post.status || "draft",
      published_at: post.published_at ? new Date(post.published_at) : null,
      sections: {
        create: (sections || []).map((s: any) => ({
          heading: s.heading,
          content_html: s.content_html,
          order_index: s.order_index,
        })),
      },
      images: {
        create: (images || []).map((img: any) => ({
          prompt: img.prompt,
          alt_text: img.alt_text,
          url: img.image_url,
          section_id: null,
        })),
      },
      internal_links: {
        create: (internal_links || []).map((link: any) => ({
          anchor_text: link.anchor_text,
          target_slug: link.target_slug,
        })),
      },
      keywords: {
        create: (keywords || []).map((kw: any) => ({
          keyword: kw.keyword,
        })),
      },
      categories: {
        create: (categories || []).map((c: any) => ({
          name: c.name,
        })),
      },
      products: {
        create: (products || []).map((p: any) => ({
          name: p.name,
          price: p.price,
          url: p.url,
          description: p.description,
        })),
      },
    },
  });
}
