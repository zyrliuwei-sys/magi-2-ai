import { createFileRoute } from '@tanstack/react-router';

import { m } from '@/paraglide/messages.js';
import { MagiInsight } from '@/blocks/magi-editorial';
import { MagiPromptLibrary } from '@/blocks/magi-library';
import { magiHead, MagiIntro, MagiSite } from '@/blocks/magi-site';

function LibraryPage() {
  return (
    <MagiSite>
      <div className="magi-wrap">
        <MagiIntro
          title={m['video.page.prompts.title']()}
          description={m['video.page.prompts.description']()}
        />
        <MagiPromptLibrary />
        <MagiInsight page="prompts" />
      </div>
    </MagiSite>
  );
}

export const Route = createFileRoute('/prompts')({
  head: () =>
    magiHead(
      '/prompts',
      m['video.page.prompts.seo_title'](),
      m['video.page.prompts.seo_description']()
    ),
  component: LibraryPage,
});
