import { createFileRoute } from '@tanstack/react-router';

import { envConfigs } from '@/config';
import { m } from '@/paraglide/messages.js';
import { MagiInsight } from '@/blocks/magi-editorial';
import {
  MagiFAQ,
  MagiGallery,
  MagiHow,
  MagiPromptLibrary,
} from '@/blocks/magi-library';
import { magiHead, MagiIntro, MagiSite } from '@/blocks/magi-site';
import { MagiStudio, parseStudioSearch } from '@/blocks/magi-studio';

function ToolPage() {
  const search = Route.useSearch();
  return (
    <MagiSite>
      <div className="magi-wrap">
        <MagiIntro
          studio
          title={m['video.page.image.title']()}
          description={m['video.page.image.description']()}
        />
        <MagiStudio
          key={search.prompt ?? 'image-to-video'}
          preview="image"
          initialMode="image-to-video"
          promptId={search.prompt}
          taskId={search.task}
          restore={search.restore}
        />
        <MagiPromptLibrary compact mode="image-to-video" />
        <MagiGallery collection="image" />
        <MagiHow />
        <MagiInsight page="image" />
        <MagiFAQ />
      </div>
    </MagiSite>
  );
}

export const Route = createFileRoute('/image-to-video')({
  validateSearch: parseStudioSearch,
  head: () =>
    magiHead(
      '/image-to-video',
      m['video.page.image.seo_title']({ appName: envConfigs.app_name }),
      m['video.page.image.seo_description']()
    ),
  component: ToolPage,
});
