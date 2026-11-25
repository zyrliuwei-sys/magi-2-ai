import { createFileRoute } from '@tanstack/react-router';

import { m } from '@/paraglide/messages.js';
import { MagiInsight } from '@/blocks/magi-editorial';
import { MagiGallery } from '@/blocks/magi-library';
import { magiHead, MagiIntro, MagiSite } from '@/blocks/magi-site';

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
