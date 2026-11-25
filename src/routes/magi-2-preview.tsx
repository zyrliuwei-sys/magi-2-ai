import { createFileRoute } from '@tanstack/react-router';

import { MagiCopyPrompt } from '@/blocks/magi-library';
import { magiHead, MagiIntro, MagiRelated, MagiSite } from '@/blocks/magi-site';
import { MagiSources } from '@/blocks/magi-sources';
import PreviewContent, { meta } from '@/content/pages/magi-2-preview.en.mdx';

export const Route = createFileRoute('/magi-2-preview')({
  head: () =>
    magiHead('/magi-2-preview', meta.seo_title ?? meta.title, meta.description),
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
        <MagiRelated topics={['examples', 'text', 'image', 'guide', 'prompts']} />
        <MagiSources page="preview" />
      </div>
    </MagiSite>
  );
}
