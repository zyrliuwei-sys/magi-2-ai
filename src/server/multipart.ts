export class MultipartTooLargeError extends Error {}

/** Limit actual bytes before formData() buffers a browser's upload. */
export async function readMultipartForm(request: Request, maxBytes: number) {
  const contentType = request.headers.get('content-type');
  if (!request.body || !contentType?.startsWith('multipart/form-data;'))
    throw new Error('Expected a multipart form');
  if (Number(request.headers.get('content-length')) > maxBytes)
    throw new MultipartTooLargeError();

  let received = 0;
  const body = request.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        received += chunk.byteLength;
        if (received > maxBytes) controller.error(new MultipartTooLargeError());
        else controller.enqueue(chunk);
      },
    })
  );
  return new Response(body, {
    headers: { 'Content-Type': contentType },
  }).formData();
}
