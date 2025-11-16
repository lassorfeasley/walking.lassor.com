import { supabase } from './client';

const RAW_BUCKET = process.env.NEXT_PUBLIC_STORAGE_BUCKET_RAW || 'raw-panoramas';
const PROCESSED_BUCKET = process.env.NEXT_PUBLIC_STORAGE_BUCKET_PROCESSED || 'processed-images';
const OPTIMIZED_BUCKET = process.env.NEXT_PUBLIC_STORAGE_BUCKET_OPTIMIZED || 'optimized-web';

export interface UploadOptions {
  bucket?: string;
  folder?: string;
  fileName?: string;
}

/**
 * Upload a file to Supabase storage
 */
export async function uploadFile(
  file: File,
  options: UploadOptions = {}
): Promise<{ path: string; url: string } | null> {
  const bucket = options.bucket || RAW_BUCKET;
  const fileName = options.fileName || `${Date.now()}-${file.name}`;
  const filePath = options.folder ? `${options.folder}/${fileName}` : fileName;

  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: false,
    });

  if (error) {
    console.error('Upload error:', error);
    return null;
  }

  const { data: urlData } = supabase.storage
    .from(bucket)
    .getPublicUrl(data.path);

  return {
    path: data.path,
    url: urlData.publicUrl,
  };
}

/**
 * Get public URL for a file in storage
 */
export function getPublicUrl(path: string, bucket?: string): string {
  const targetBucket = bucket || RAW_BUCKET;
  const { data } = supabase.storage.from(targetBucket).getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Delete a file from storage
 */
export async function deleteFile(path: string, bucket?: string): Promise<boolean> {
  const targetBucket = bucket || RAW_BUCKET;
  const { error } = await supabase.storage.from(targetBucket).remove([path]);
  return !error;
}

/**
 * List files in a bucket
 */
export async function listFiles(bucket?: string, folder?: string): Promise<string[]> {
  const targetBucket = bucket || RAW_BUCKET;
  const { data, error } = await supabase.storage.from(targetBucket).list(folder);

  if (error) {
    console.error('List error:', error);
    return [];
  }

  return data.map((file) => file.name);
}

export { RAW_BUCKET, PROCESSED_BUCKET, OPTIMIZED_BUCKET };

