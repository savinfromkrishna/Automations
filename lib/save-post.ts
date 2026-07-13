import { prisma } from "./prisma";

// Turns a title/slug into a URL-safe base slug.
function slugify(input: string): string {
  return String(input || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 200) || "post";
}

// Finds a slug that isn't already taken, appending -2, -3, … on collision.
async function ensureUniqueSlug(desired: string): Promise<string> {
  const base = slugify(desired);
  let candidate = base;
  let n = 1;
  // Loop until we find a free slug (bounded to avoid any pathological runaway).
  while (n < 1000) {
    const existing = await prisma.post.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
    n += 1;
    candidate = `${base}-${n}`;
  }
  // Extremely unlikely fallback: suffix with a unique-ish counter.
  return `${base}-${Date.now()}`;
}

export async function savePostToDb(data: any) {
  const { post, sections, images, internal_links, keywords, categories, products } = data;

  // Retry on the off chance two concurrent saves race to the same slug: the
  // pre-check below resolves almost all cases, and P2002 catches the rest.
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = await ensureUniqueSlug(
      attempt === 0 ? (post.slug || post.title) : `${slugify(post.slug || post.title)}-${attempt + 1}`
    );
    try {
      return await createPost(post, slug, { sections, images, internal_links, keywords, categories, products });
    } catch (e: any) {
      const isSlugConflict =
        e?.code === "P2002" && (e?.meta?.target?.includes?.("slug") ?? true);
      if (isSlugConflict && attempt < 4) continue;
      throw e;
    }
  }
  throw new Error("Failed to save post: could not allocate a unique slug.");
}

function createPost(
  post: any,
  slug: string,
  rel: { sections: any; images: any; internal_links: any; keywords: any; categories: any; products: any }
) {
  const { sections, images, internal_links, keywords, categories, products } = rel;
  return prisma.post.create({
    data: {
      title: post.title,
      slug,
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
