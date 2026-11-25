import { createFileRoute } from '@tanstack/react-router';

import { jsonLd } from '@/lib/seo';
import { MagiCopyPrompt } from '@/blocks/magi-library';
import { magiHead, MagiIntro, MagiRelated, MagiSite } from '@/blocks/magi-site';
import { MagiSources } from '@/blocks/magi-sources';
import PreviewContent, {
  faqEntries,
  meta,
} from '@/content/pages/magi-2-preview.en.mdx';

export const Route = createFileRoute('/magi-2-preview')({
  head: () => ({
    ...magiHead(
      '/magi-2-preview',
      meta.seo_title ?? meta.title,
      meta.description
    ),
    scripts: [
      jsonLd({
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: faqEntries.map(({ question, answer }) => ({
          '@type': 'Question',
          name: question,
          acceptedAnswer: { '@type': 'Answer', text: answer },
        })),
      }),
    ],
  }),
  component: PreviewPage,
});

function PreviewPage() {
  return (
    <MagiSite>
      <div className="magi-wrap">
        <MagiIntro title={meta.title} description={meta.description} />
        <article className="magi-preview-article">
          <PreviewContent components={{ MagiCopyPrompt }} />
        </article>
        <MagiRelated
          topics={['examples', 'text', 'image', 'guide', 'prompts']}
        />
        <MagiSources page="preview" />
      </div>
    </MagiSite>
  );
}
