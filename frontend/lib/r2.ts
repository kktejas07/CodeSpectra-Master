/** Back-compat — all storage lives in s3-storage.ts (R2 is one S3 endpoint). */
export {
  lessonObjectKey,
  lessonObjectKey as lessonR2Key,
  r2EndpointFromAccount,
  r2Host,
  readS3Config,
  readS3Config as readR2Config,
  s3DeleteObject as r2DeleteObject,
  s3Ping as r2Ping,
  s3PutObject as r2PutObject,
  s3SignedGetUrl as r2SignedGetUrl,
  type S3Config as R2Config,
} from '@/lib/s3-storage'
