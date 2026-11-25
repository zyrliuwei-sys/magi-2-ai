import { createFileRoute } from '@tanstack/react-router';

import { m } from '@/paraglide/messages.js';
import { MagiInsight } from '@/blocks/magi-editorial';
import { MagiGallery } from '@/blocks/magi-library';
import { magiHead, MagiIntro, MagiRelated, MagiSite } from '@/blocks/magi-site';
import { MagiSources } from '@/blocks/magi-sources';

function LibraryPage() {
  return (
    <MagiSite>
      <div className="magi-wrap">
        <MagiIntro
          title={m['video.page.examples.title']()}
          description={m['video.page.examples.description']()}
        />
        <MagiGallery />
        <MagiInsight page="examples" />
        <MagiRelated topics={['text', 'image', 'guide', 'prompts', 'preview']} />
        <MagiSources page="examples" />
      </div>
    </MagiSite>
  );
}

export const Route = createFileRoute('/examples')({
  head: () =>
    magiHead(
      '/examples',
      m['video.page.examples.seo_title'](),
      m['video.page.examples.seo_description']()
    ),
  component: LibraryPage,
});
