import { BlobServiceClient } from "@azure/storage-blob";

const blobServiceClient = BlobServiceClient.fromConnectionString(
  process.env.AZURE_STORAGE_CONNECTION_STRING
);

const containerClient = blobServiceClient.getContainerClient("clips");

export async function uploadClipToAzure(localFilePath, filename) {
  await containerClient.createIfNotExists();

  const blockBlobClient = containerClient.getBlockBlobClient(filename);

  await blockBlobClient.uploadFile(localFilePath, {
    blobHTTPHeaders: {
      blobContentType: "video/mp4",
    },
  });

  return blockBlobClient.url;
}