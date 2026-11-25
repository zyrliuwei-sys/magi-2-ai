import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { test } from 'node:test';

import { defaultAppLogo } from '../src/config';
import { magiStudioClips } from '../src/config/magi-content';
import {
  MultipartTooLargeError,
  readMultipartForm,
} from '../src/server/multipart';

test('the navigation mark and each studio poster are available at build time', async () => {
  const assets = [
    defaultAppLogo,
    ...Object.values(magiStudioClips)
      .flat()
      .map(({ poster }) => poster),
  ];
  await Promise.all(
    assets.map((asset) => access(new URL(`../public${asset}`, import.meta.url)))
  );
});

test('multipart reads accept normal forms and stop at the actual byte limit', async () => {
  const form = new FormData();
  form.set('input', 'test upload');
  const request = new Request('https://example.test/api/storage/upload-image', {
    method: 'POST',
    body: form,
  });
  const duplicate = request.clone();
  assert.equal(request.headers.get('content-length'), null);
  assert.equal(
    (await readMultipartForm(request, 1024)).get('input'),
    'test upload'
  );
  await assert.rejects(
    readMultipartForm(duplicate, 12),
    MultipartTooLargeError
  );
});
