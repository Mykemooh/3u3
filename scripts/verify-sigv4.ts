/**
 * Proves lib/storage.ts's request signer matches AWS's reference
 * implementation, using the worked example from AWS's own documentation
 * ("Authenticating Requests: Using Query Parameters", S3 API reference).
 * Same algorithm R2 uses, so if this passes, R2 upload URLs are signed right.
 *
 *   npx tsx scripts/verify-sigv4.ts
 */
import { presignUrl } from '../lib/storage';

const url = presignUrl({
  method: 'GET',
  host: 'examplebucket.s3.amazonaws.com',
  path: '/test.txt',
  accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  region: 'us-east-1',
  expiresSeconds: 86400,
  now: new Date('2013-05-24T00:00:00Z'),
});

const expected = 'aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404';
const got = new URL(url).searchParams.get('X-Amz-Signature');
if (got !== expected) {
  console.error(`FAIL\n  expected ${expected}\n  got      ${got}\n  url      ${url}`);
  process.exit(1);
}
console.log('PASS — signature matches the AWS reference example.');
