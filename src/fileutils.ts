export async function isBinaryFile(path: string): Promise<boolean> {
  try {
    const file = await Deno.open(path);
    const buffer = new Uint8Array(1024);
    const bytesRead = await file.read(buffer);
    file.close();

    if (bytesRead === null || bytesRead === 0) {
      return false; // Empty file, assume not binary
    }

    // Check for null bytes (common in binary files)
    const slice = buffer.subarray(0, bytesRead);
    for (const byte of slice) {
      if (byte === 0) {
        return true;
      }
    }

    // Check if the content is valid UTF-8
    try {
      const decoder = new TextDecoder("utf-8", { fatal: true });
      decoder.decode(slice);
      return false; // Valid UTF-8 = text file
    } catch {
      return true; // Invalid UTF-8 = binary
    }
  } catch {
    return false; // On error, assume not binary
  }
}
