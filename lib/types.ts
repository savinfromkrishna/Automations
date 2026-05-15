export interface Post {
  title: string;
  slug: string;
  meta_description: string;
  featured_image_prompt: string;
  featured_image_url?: string;
  reading_time: string;
  created_at: string;
  status: "draft" | "published";
  published_at: string | null;
}

export interface Section {
  post_id_ref: string;
  heading: string;
  content_html: string;
  order_index: number;
}

export interface ImageRecord {
  post_id_ref: string;
  section_heading_ref: string | null;
  prompt: string;
  alt_text: string;
  image_url?: string;
}

export interface InternalLink {
  post_id_ref: string;
  anchor_text: string;
  target_slug: string;
}

export interface Keyword {
  post_id_ref: string;
  keyword: string;
}

export interface Category {
  post_id_ref: string;
  name: string;
}

export interface Product {
  post_id_ref: string;
  name: string;
  price?: string;
  url?: string;
  description?: string;
}

export interface GenerationResult {
  post: Post;
  sections: Section[];
  images: ImageRecord[];
  internal_links: InternalLink[];
  keywords: Keyword[];
  categories: Category[];
  products: Product[];
}
