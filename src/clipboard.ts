export async function copyToClipboard(content: string): Promise<void> {
  // Try wl-copy first (Wayland)
  try {
    const wlCopy = new Deno.Command("wl-copy", {
      stdin: "piped",
      stdout: "null",
      stderr: "piped",
    });

    const process = wlCopy.spawn();
    const writer = process.stdin.getWriter();
    await writer.write(new TextEncoder().encode(content));
    await writer.close();
    const status = await process.status;

    if (status.success) {
      return;
    }
  } catch {
    // wl-copy not available, try X11 tools
  }

  // Try xsel (X11)
  try {
    const xsel = new Deno.Command("xsel", {
      args: ["--clipboard", "--input"],
      stdin: "piped",
      stdout: "null",
      stderr: "piped",
    });

    const process = xsel.spawn();
    const writer = process.stdin.getWriter();
    await writer.write(new TextEncoder().encode(content));
    await writer.close();
    const status = await process.status;

    if (status.success) {
      return;
    }
  } catch {
    // xsel not available, try xclip
  }

  // Fallback to xclip (X11)
  try {
    const xclip = new Deno.Command("xclip", {
      args: ["-selection", "clipboard"],
      stdin: "piped",
      stdout: "null",
      stderr: "piped",
    });

    const process2 = xclip.spawn();
    const writer2 = process2.stdin.getWriter();
    await writer2.write(new TextEncoder().encode(content));
    await writer2.close();
    const status2 = await process2.status;

    if (status2.success) {
      return;
    }
  } catch {
    // xclip not available
  }

  throw new Error(
    "failed to write to clipboard: wl-copy, xsel, and xclip all failed",
  );
}
