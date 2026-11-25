import { createFileRoute } from '@tanstack/react-router';

import { envConfigs } from '@/config';
import { jsonLd } from '@/lib/seo';
import { m } from '@/paraglide/messages.js';
import { MagiEditorial } from '@/blocks/magi-editorial';
import {
  MagiFAQ,
  MagiGallery,
  MagiHow,
  MagiPromptLibrary,
} from '@/blocks/magi-library';
import { MagiPricing } from '@/blocks/magi-pricing';
import { magiHead, MagiHomeIntro, MagiSite } from '@/blocks/magi-site';
import { MagiStudio, parseStudioSearch } from '@/blocks/magi-studio';

function HomePage() {
  const search = Route.useSearch();
  return (
    <MagiSite>
      <div className="magi-wrap">
        <MagiHomeIntro />
        <MagiStudio
          key={search.prompt ?? 'home'}
          preview="home"
          initialMode="text-to-video"
          promptId={search.prompt}
          taskId={search.task}
          restore={search.restore}
        />
        <MagiGallery collection="home" />
        <MagiGallery collection="higgsfield" />
        <MagiHow />
        <MagiPromptLibrary compact />
        <MagiEditorial />
        <MagiPricing embedded />
        <MagiFAQ />
      </div>
    </MagiSite>
  );
}

export const Route = createFileRoute('/')({
  validateSearch: parseStudioSearch,
  head: () => {
    const description = m['common.metadata.description']();
    return {
      ...magiHead(
        '/',
        m['common.metadata.title']({ appName: envConfigs.app_name }),
        description
      ),
      scripts: [
        jsonLd({
          '@context': 'https://schema.org',
          '@type': 'WebApplication',
          name: envConfigs.app_name,
          description,
          url: new URL('/', envConfigs.app_url).href,
          applicationCategory: 'MultimediaApplication',
        }),
      ],
    };
  },
  component: HomePage,
});
