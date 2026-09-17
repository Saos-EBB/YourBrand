import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

let client: S3Client | undefined;

function getClient(): S3Client {
    if (!client) {
        if (!process.env.S3_ENDPOINT) throw new Error('S3_ENDPOINT env var is not set');
        client = new S3Client({
            endpoint: process.env.S3_ENDPOINT,
            region: process.env.S3_REGION ?? 'auto',
            credentials: {
                accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
                secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
            },
            // Required for MinIO and most non-AWS S3-compatible providers —
            // virtual-hosted-style (bucket.endpoint) URLs don't resolve there.
            forcePathStyle: true,
        });
    }
    return client;
}

function getBucket(): string {
    if (!process.env.S3_BUCKET) throw new Error('S3_BUCKET env var is not set');
    return process.env.S3_BUCKET;
}

function getPublicUrlBase(): string {
    if (!process.env.S3_PUBLIC_URL_BASE) throw new Error('S3_PUBLIC_URL_BASE env var is not set');
    return process.env.S3_PUBLIC_URL_BASE.replace(/\/$/, '');
}

/** Uploads a buffer under `key` and returns its public URL. */
export async function uploadObject(key: string, body: Buffer, contentType: string): Promise<string> {
    await getClient().send(new PutObjectCommand({
        Bucket: getBucket(),
        Key: key,
        Body: body,
        ContentType: contentType,
    }));
    return `${getPublicUrlBase()}/${key}`;
}

/** Downloads the object at `key` into memory. */
export async function downloadObject(key: string): Promise<Buffer> {
    const response = await getClient().send(new GetObjectCommand({
        Bucket: getBucket(),
        Key: key,
    }));
    const bytes = await response.Body!.transformToByteArray();
    return Buffer.from(bytes);
}

/** Deletes the object at `key`. */
export async function deleteObject(key: string): Promise<void> {
    await getClient().send(new DeleteObjectCommand({
        Bucket: getBucket(),
        Key: key,
    }));
}

/** Strips getPublicUrlBase() off a stored file_url to recover the S3 key. */
export function keyFromPublicUrl(fileUrl: string): string | null {
    const base = getPublicUrlBase() + '/';
    return fileUrl.startsWith(base) ? fileUrl.slice(base.length) : null;
}
