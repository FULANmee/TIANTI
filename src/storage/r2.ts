import "server-only";

import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getR2StorageConfig, isMockStorageMode } from "@/lib/env";

function getR2Client() {
  const config = getR2StorageConfig();
  return new S3Client({
    region: "auto",
    endpoint: config.endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey
    }
  });
}

function buildObjectKey(fileName: string) {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").toLowerCase();
  return `uploads/${Date.now()}-${safeName}`;
}

export async function createUploadSignature(fileName: string, contentType: string) {
  if (isMockStorageMode()) {
    return {
      mode: "mock" as const,
      uploadUrl: null,
      publicUrl: null,
      objectKey: null
    };
  }

  const config = getR2StorageConfig();
  const objectKey = buildObjectKey(fileName);
  const command = new PutObjectCommand({
    Bucket: config.bucket,
    Key: objectKey,
    ContentType: contentType
  });

  return {
    mode: "r2" as const,
    uploadUrl: await getSignedUrl(getR2Client(), command, { expiresIn: 60 * 5 }),
    publicUrl: `${config.publicBaseUrl}/${objectKey}`,
    objectKey
  };
}

export async function uploadObjectToR2(fileName: string, contentType: string, body: Uint8Array) {
  if (isMockStorageMode()) {
    throw new Error("当前环境还没有启用真实对象存储。");
  }

  const config = getR2StorageConfig();
  const objectKey = buildObjectKey(fileName);
  try {
    await getR2Client().send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: objectKey,
        ContentType: contentType,
        Body: body
      })
    );
  } catch (error) {
    throw new Error(
      `R2 上传失败：${error instanceof Error && error.message ? error.message : "请检查 Bucket、Endpoint 和密钥配置。"}`
    );
  }

  return {
    objectKey,
    publicUrl: `${config.publicBaseUrl}/${objectKey}`
  };
}

export async function deleteObjectFromR2(objectKey: string) {
  if (isMockStorageMode()) {
    return;
  }

  const config = getR2StorageConfig();
  await getR2Client().send(
    new DeleteObjectCommand({
      Bucket: config.bucket,
      Key: objectKey
    })
  );
}
