import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "../config/env.js";

export interface StorageAdapter {
  put(key: string, data: Buffer, mimeType: string): Promise<string>;
}
class LocalStorageAdapter implements StorageAdapter {
  private root = path.resolve(env.LOCAL_STORAGE_PATH);
  async put(key: string, data: Buffer, mimeType: string) {
    const safe = key
      .split("/")
      .map((part) => path.basename(part))
      .join(path.sep);
    const target = path.resolve(this.root, safe);
    if (!target.startsWith(`${this.root}${path.sep}`)) throw new Error("Invalid storage key.");
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, data);
    return `/uploads/${key.split("/").map(encodeURIComponent).join("/")}`;
  }
}
class S3StorageAdapter implements StorageAdapter {
  private client = new S3Client({
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT || undefined,
    forcePathStyle: !!env.S3_ENDPOINT,
  });
  async put(key: string, data: Buffer, mimeType: string) {
    const safe = key
      .split("/")
      .map((part) => path.basename(part))
      .join("/");
    await this.client.send(
      new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: safe, Body: data, ContentType: mimeType }),
    );
    if (env.S3_ENDPOINT) return `${env.S3_ENDPOINT.replace(/\/$/, "")}/${env.S3_BUCKET}/${safe}`;
    return `https://${env.S3_BUCKET}.s3.${env.S3_REGION}.amazonaws.com/${safe}`;
  }
}
export const storageAdapter: StorageAdapter =
  env.STORAGE_DRIVER === "s3" ? new S3StorageAdapter() : new LocalStorageAdapter();
