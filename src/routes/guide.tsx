import { createFileRoute } from '@tanstack/react-router';

import { m } from '@/paraglide/messages.js';
import { MagiGuide } from '@/blocks/magi-library';
import { magiHead, MagiSite } from '@/blocks/magi-site';

export const Route = createFileRoute('/guide')({
  head: () =>
    magiHead(
      '/guide',
      m['video.page.guide.seo_title'](),
      m['video.page.guide.seo_description']()
    ),
  component: () => (
    <MagiSite>
      <MagiGuide />
    </MagiSite>
  ),
});
