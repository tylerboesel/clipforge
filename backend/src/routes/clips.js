import { Router } from "express";
import { BlobServiceClient } from "@azure/storage-blob";
import path from "path";

export const clipsRouter = Router();

const blobServiceClient = BlobServiceClient.fromConnectionString(
  process.env.AZURE_STORAGE_CONNECTION_STRING
);
const containerClient = blobServiceClient.getContainerClient("clips");

// ── GET /api/clips/:filename/download ────────────────────────────────────────
clipsRouter.get("/:filename/download", async (req, res) => {
  const filename = path.basename(req.params.filename);
  if (!/^[\w\-]+\.mp4$/.test(filename)) {
    return res.status(400).json({ error: "Invalid filename" });
  }
  try {
    const blobClient = containerClient.getBlobClient(filename);
    const props = await blobClient.getProperties();
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Content-Length", props.contentLength);
    const download = await blobClient.download();
    download.readableStreamBody.pipe(res);
  } catch (e) {
    res.status(404).json({ error: "Clip not found" });
  }
});

// ── GET /api/clips/:filename/stream ──────────────────────────────────────────
clipsRouter.get("/:filename/stream", async (req, res) => {
  const filename = path.basename(req.params.filename);
  if (!/^[\w\-]+\.mp4$/.test(filename)) {
    return res.status(400).json({ error: "Invalid filename" });
  }
  try {
    const blobClient = containerClient.getBlobClient(filename);
    const props = await blobClient.getProperties();
    const fileSize = props.contentLength;
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = end - start + 1;
      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunkSize,
        "Content-Type": "video/mp4",
      });
      const download = await blobClient.download(start, chunkSize);
      download.readableStreamBody.pipe(res);
    } else {
      res.writeHead(200, {
        "Content-Length": fileSize,
        "Content-Type": "video/mp4",
        "Accept-Ranges": "bytes",
      });
      const download = await blobClient.download();
      download.readableStreamBody.pipe(res);
    }
  } catch (e) {
    res.status(404).json({ error: "Clip not found" });
  }
});
