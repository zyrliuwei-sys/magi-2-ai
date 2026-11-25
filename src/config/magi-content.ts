import type { VideoMode } from './magi-video';

export const sandMagiAnnouncement = 'https://sand.ai/blog/magi-2';
export const higgsfieldMagiIntro = 'https://higgsfield.ai/magi-2-intro';
export const higgsfieldMagiDocs =
  'https://open.higgsfield.ai/models/sand/magi-2/text-to-video/api-reference';
export const perfumeStill = '/imgs/magi/amber-perfume.jpg';
const sandMedia = 'https://static.magi.world/media/website/';
const artStylesVideo =
  '01f847c8f459fa2b2831796dade7fa9b72acdfe5f77538044d455973f07c6362';

const clips = [
  ['styles', 'animation', artStylesVideo, 'paper'],
  [
    'flowers',
    'character',
    '7e823798bc17774a51d5f9ef8ad1cf6b1db750058c7c80a24bde83a46d83debc',
    'forest',
  ],
  [
    'cuts',
    'camera',
    '173dba46280a4b05ae603bd9f5b43a1fed9239a815ff5db022381bdf93693018',
    'coffee',
  ],
  [
    'editing',
    'camera',
    '4a6c7a224b68c5637bd2c1e6cd75d723a205f57cd75a52fbcbe684544dd14c38',
    'night',
  ],
  [
    'lunar',
    'camera',
    '3f86e0ff4b9f61e714614d560576368f7e695354aa9f81c1693b13107d0d2869',
    'dolly',
  ],
  [
    'alpine',
    'camera',
    '3dafefd20ec804cea9737517b692eadf229dc147437351f58337acc013876b39',
    'forest',
  ],
] as const;

const sandExamples = clips.map(([id, category, video, prompt]) => ({
  id,
  category,
  prompt,
  video: `${sandMedia}${video}.mp4`,
  poster: undefined,
  source: sandMagiAnnouncement,
  publisher: 'sand' as const,
  kind: 'model' as const,
}));

function higgsfieldExample<Id extends string>(
  id: Id,
  category: 'animation' | 'character' | 'camera',
  slider: number
) {
  return {
    id,
    category,
    prompt: null,
    video: `https://static.higgsfield.ai/magi-2-intro/examples/mobile/slider-${slider}.mp4`,
    poster: `/imgs/magi/${id}.webp`,
    source: higgsfieldMagiIntro,
    publisher: 'higgsfield' as const,
    kind: 'model' as const,
  };
}

export const magiHiggsfieldExamples = [
  higgsfieldExample('storm-wings', 'character', 2),
  higgsfieldExample('ember-vortex', 'camera', 5),
  higgsfieldExample('solar-guardian', 'animation', 7),
];

const cosmicFamiliar = higgsfieldExample('cosmic-familiar', 'animation', 3);
const machineHorizon = higgsfieldExample('machine-horizon', 'camera', 6);

export const magiExamples = [...sandExamples, ...magiHiggsfieldExamples];

export const magiPrompts = [
  { id: 'orbit', category: 'product', mode: 'image-to-video' },
  { id: 'dolly', category: 'product', mode: 'image-to-video' },
  { id: 'coffee', category: 'product', mode: 'text-to-video' },
  { id: 'tabletop', category: 'product', mode: 'image-to-video' },
  { id: 'water', category: 'product', mode: 'image-to-video' },
  { id: 'dialogue', category: 'character', mode: 'text-to-video' },
  { id: 'forest', category: 'character', mode: 'text-to-video' },
  { id: 'night', category: 'camera', mode: 'text-to-video' },
  { id: 'paper', category: 'animation', mode: 'text-to-video' },
  { id: 'stopmotion', category: 'animation', mode: 'text-to-video' },
] as const satisfies ReadonlyArray<{
  id: string;
  category: string;
  mode: VideoMode;
}>;

export type MagiPromptId = (typeof magiPrompts)[number]['id'];
export const magiGuides = ['product', 'camera', 'sound'] as const;

function localClip(id: string) {
  return {
    video: `/videos/magi/${id}.mp4`,
    poster: `/imgs/magi/${id}.webp`,
  };
}

function pexelsSource(source: string) {
  return new URL(source, 'https://www.pexels.com/video/').href;
}

function studioClip(id: string, source: string) {
  return {
    ...localClip(id),
    source: pexelsSource(source),
    publisher: 'pexels' as const,
  };
}

const fashionDuo = studioClip(
  'fashion-duo',
  'two-women-in-suit-jackets-in-cave-9861746/'
);

export const magiStudioClips = {
  home: [
    {
      ...studioClip(
        'studio-mist',
        'elegant-perfume-bottling-with-mist-effect-33233537/'
      ),
      label: 'home',
    },
    {
      video: `${sandMedia}${artStylesVideo}.mp4`,
      poster: '/imgs/magi/studio-art-styles.webp',
      source: sandMagiAnnouncement,
      publisher: 'sand',
      label: 'art_styles',
    },
    { ...machineHorizon, label: 'machine_horizon' },
    { ...fashionDuo, label: 'fashion_duo' },
  ],
  text: [
    {
      ...studioClip(
        'studio-coffee',
        'a-person-pouring-hot-coffee-into-a-ceramic-cup-11412552/'
      ),
      label: 'text',
    },
  ],
  image: [
    {
      ...studioClip(
        'studio-perfume',
        'elegant-perfume-bottle-in-minimalist-lighting-37528254/'
      ),
      label: 'image',
    },
  ],
} as const;

type ReferenceClip = readonly [
  id: string,
  source: string,
  prompt: MagiPromptId | null,
];

const references = {
  home: [
    cosmicFamiliar,
    ['coast', 'ocean-sunset-wave-27936517/', null],
    machineHorizon,
  ],
  text: [
    [
      'cup',
      'a-coffee-cup-on-a-table-with-a-view-of-the-sun-15520346/',
      'coffee',
    ],
    [
      'waves',
      'https://videos.pexels.com/video-files/8366026/8366026-hd_1080_1920_25fps.mp4',
      null,
    ],
    [
      'forest',
      'autumn-forest-walk-with-sunlight-filtering-through-trees-34783268/',
      'forest',
    ],
  ],
  image: [
    [
      'dropper',
      'https://videos.pexels.com/video-files/7607246/7607246-uhd_4096_2160_25fps.mp4',
      'dolly',
    ],
    ['spray', 'close-up-video-of-a-bottle-sprayer-7034150/', 'orbit'],
    [
      'serum',
      'close-up-video-of-serum-dripping-on-person-s-palm-8131887/',
      'water',
    ],
  ],
} as const satisfies Record<
  keyof typeof magiStudioClips,
  readonly (ReferenceClip | ReturnType<typeof higgsfieldExample>)[]
>;

export function magiReferences(collection: keyof typeof references) {
  return references[collection].map((clip) => {
    if ('kind' in clip) return clip;

    const [id, source, prompt] = clip;
    return {
      id,
      prompt,
      video: localClip(id).video,
      poster: undefined,
      source: pexelsSource(source),
      kind: 'stock' as const,
    };
  });
}

function sandGuideClip(id: string) {
  return {
    url: `${sandMedia}${id}.mp4`,
    source: sandMagiAnnouncement,
    publisher: 'sand',
  } as const;
}

const higgsfieldPreview =
  'https://d28lhcrx5qdowv.cloudfront.net/media/explore/media/';
export const magiGuideClips = {
  overview: sandGuideClip(
    'c73e504bd9e595ed8fa2ec65d0e9af1e48d68bcceb4d424eda08f770578e78ad'
  ),
  text: {
    url: `${higgsfieldPreview}9493309fb9b801cef1cfa2419a005036efb99813592fb8087bbcc4d846761205-video.mp4`,
    source:
      'https://open.higgsfield.ai/models/sand/magi-2/text-to-video/playground',
    publisher: 'higgsfield',
  },
  image: {
    url: 'https://cdn.sanity.io/files/s479xw3z/production/0cc5e0a17afaa9ff92b1f306d34b8cf36a9c7732.mp4',
    source: 'https://higgsfield.ai/blog/how-to-make-beauty-video-ads-with-ai',
    publisher: 'higgsfield',
  },
  audio: {
    url: fashionDuo.video,
    poster: fashionDuo.poster,
    source: fashionDuo.source,
    publisher: 'pexels',
  },
  format: {
    url: 'https://cdn.sanity.io/files/s479xw3z/production/168eaeaae6a483d37980ab084f20c9e1c304fa85.mp4',
    source: 'https://higgsfield.ai/blog/how-to-make-beauty-video-ads-with-ai',
    publisher: 'higgsfield',
  },
  review: sandGuideClip(
    '229a38e0758e68f798c600816654ce75d0c9f72427431481d94c367f02a17f6c'
  ),
} as const;
