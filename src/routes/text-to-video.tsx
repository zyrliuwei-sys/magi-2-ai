import { createFileRoute } from '@tanstack/react-router';

import { envConfigs } from '@/config';
import { m } from '@/paraglide/messages.js';
import { MagiInsight } from '@/blocks/magi-editorial';
import {
  MagiFAQ,
  MagiGallery,
  MagiPromptLibrary,
} from '@/blocks/magi-library';
import { magiHead, MagiIntro, MagiLink, MagiSite } from '@/blocks/magi-site';
import { MagiSources } from '@/blocks/magi-sources';
import { MagiStudio, parseStudioSearch } from '@/blocks/magi-studio';

function ToolPage() {
  const search = Route.useSearch();
  return (
    <MagiSite>
      <div className="magi-wrap">
        <MagiIntro
          studio
          title={m['video.page.text.title']()}
          description={m['video.page.text.description']()}
        />
        <MagiStudio
          key={search.prompt ?? 'text-to-video'}
          preview="text"
          initialMode="text-to-video"
          promptId={search.prompt}
          taskId={search.task}
          restore={search.restore}
        />
        <MagiPromptLibrary compact mode="text-to-video" />
        <MagiGallery collection="text" />
        <p className="magi-section">
          <MagiLink href="/examples">{m['video.gallery.study']()}</MagiLink>
        </p>
        <MagiInsight page="text" />
        <MagiFAQ page="text" />
        <MagiSources page="text" />
      </div>
    </MagiSite>
  );
}

export const Route = createFileRoute('/text-to-video')({
  validateSearch: parseStudioSearch,
  head: () =>
    magiHead(
      '/text-to-video',
      m['video.page.text.seo_title']({ appName: envConfigs.app_name }),
      m['video.page.text.seo_description']()
    ),
  component: ToolPage,
});
