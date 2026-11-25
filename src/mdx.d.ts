declare module '*.mdx' {
  import type { ComponentType } from 'react';

  export const meta: {
    title: string;
    seo_title?: string;
    description: string;
    updated_at: string;
  };

  export const faqEntries: readonly { question: string; answer: string }[];

  const MDXComponent: ComponentType<{
    components?: Record<string, ComponentType<any>>;
  }>;
  export default MDXComponent;
}
