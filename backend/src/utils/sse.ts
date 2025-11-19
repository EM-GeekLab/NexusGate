export async function* parseSse(
  body: ReadableStream<Uint8Array<ArrayBufferLike>>,
) {
  const decoder = new TextDecoderStream();
  const reader = body.pipeThrough(decoder).getReader();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();

    if (done) {break;}
    if (!value) {continue;}

    buffer += value;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? ""; // we can assume that only the last line is incomplete

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        // simplified logic for OpenAI API, which always return 'data' event
        const data = line.slice(6).trim();
        yield data;
      }
    }
  }
}
