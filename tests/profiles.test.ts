import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildProfileStoragePath,
  generateProfileUploadUrl,
  generateProfileDownloadUrl,
  saveProfileRecord,
  listProfiles,
  getProfile,
  deleteProfile,
  acquireProfileLock,
  releaseProfileLock,
  BrowserProfileRecord,
} from '../functions/utils/profiles.js';

// In-memory mock of Cloudflare D1
class MockD1 {
  private records: Map<string, any> = new Map();

  prepare(query: string) {
    const self = this;
    let boundArgs: any[] = [];

    return {
      bind(...args: any[]) {
        boundArgs = args;
        return this;
      },
      async run() {
        const q = query.trim();
        if (q.startsWith('INSERT INTO browser_profiles')) {
          const [id, tenant_id, name, storage_path, zip_size, user_agent, browser_version, status, checksum, metadata] = boundArgs;
          const key = `${tenant_id}:${id}`;
          const existing = self.records.get(key) || {};
          self.records.set(key, {
            ...existing,
            id,
            tenant_id,
            name: name || existing.name || id,
            storage_path,
            zip_size: zip_size || existing.zip_size || 0,
            user_agent: user_agent || existing.user_agent,
            browser_version: browser_version || existing.browser_version,
            status: status || existing.status || 'idle',
            checksum_sha256: checksum || existing.checksum_sha256,
            metadata: metadata ? JSON.parse(metadata) : existing.metadata,
            updated_at: new Date().toISOString(),
          });
          return { meta: { changes: 1 } };
        } else if (q.startsWith('UPDATE browser_profiles')) {
          if (q.includes('SET locked_by_device_id = ?')) {
            const [deviceId, lockExpires, tenant_id, id, reqDeviceId, now] = boundArgs;
            const key = `${tenant_id}:${id}`;
            const existing = self.records.get(key);
            if (existing) {
              const canLock = !existing.locked_by_device_id || existing.locked_by_device_id === reqDeviceId || (existing.locked_until && existing.locked_until < now);
              if (canLock) {
                existing.locked_by_device_id = deviceId;
                existing.locked_until = lockExpires;
                existing.status = 'running';
                self.records.set(key, existing);
                return { meta: { changes: 1 } };
              }
            }
          } else if (q.includes('SET locked_by_device_id = NULL')) {
            const [tenant_id, id, deviceId] = boundArgs;
            const key = `${tenant_id}:${id}`;
            const existing = self.records.get(key);
            if (existing && (!existing.locked_by_device_id || existing.locked_by_device_id === deviceId)) {
              existing.locked_by_device_id = null;
              existing.locked_until = null;
              existing.status = 'idle';
              self.records.set(key, existing);
              return { meta: { changes: 1 } };
            }
          }
          return { meta: { changes: 0 } };
        } else if (q.startsWith('DELETE FROM browser_profiles')) {
          const [tenant_id, id] = boundArgs;
          const key = `${tenant_id}:${id}`;
          const deleted = self.records.delete(key);
          return { meta: { changes: deleted ? 1 : 0 } };
        }
        return { meta: { changes: 0 } };
      },
      async first() {
        const [tenant_id, id] = boundArgs;
        const key = `${tenant_id}:${id}`;
        return self.records.get(key) || null;
      },
      async all() {
        const [tenant_id] = boundArgs;
        const results: any[] = [];
        for (const [k, v] of self.records.entries()) {
          if (v.tenant_id === tenant_id) {
            results.push(v);
          }
        }
        return { results };
      },
    };
  }
}

describe('Browser Profile R2 & D1 Storage', () => {
  const TENANT_A = 'tenant-alpha-001';
  const TENANT_B = 'tenant-beta-002';
  const PROFILE_ID = 'work-profile-chrome';

  let mockD1: MockD1;
  const mockEnv = {
    R2_ACCOUNT_ID: 'fake-account-12345',
    R2_ACCESS_KEY_ID: 'fake-access-key-abcdef',
    R2_SECRET_ACCESS_KEY: 'fake-secret-key-1234567890abcdef',
    R2_BUCKET_NAME: 'tuquet-browser-profiles',
  };

  beforeEach(() => {
    mockD1 = new MockD1();
  });

  it('builds secure, tenant-isolated storage path', () => {
    const fixedTs = 1700000000000;
    const pathDefault = buildProfileStoragePath(TENANT_A, PROFILE_ID, fixedTs);
    expect(pathDefault).toBe(`tenants/${TENANT_A}/profiles/${PROFILE_ID}/${fixedTs}.tar.zst`);

    const pathZip = buildProfileStoragePath(TENANT_A, PROFILE_ID, fixedTs, 'zip');
    expect(pathZip).toBe(`tenants/${TENANT_A}/profiles/${PROFILE_ID}/${fixedTs}.zip`);

    // Prevents directory traversal injection
    const dirtyPath = buildProfileStoragePath('../../../evil-tenant', '../../evil-profile', fixedTs);
    expect(dirtyPath).not.toContain('..');
    expect(dirtyPath).toBe('tenants/evil-tenant/profiles/evil-profile/1700000000000.tar.zst');
  });

  it('generates valid S3 presigned upload URL', async () => {
    const result = await generateProfileUploadUrl(mockEnv, TENANT_A, PROFILE_ID);
    expect(result.profile_id).toBe(PROFILE_ID);
    expect(result.storage_path).toContain(`tenants/${TENANT_A}/profiles/${PROFILE_ID}`);
    expect(result.upload_url).toContain('https://fake-account-12345.r2.cloudflarestorage.com');
    expect(result.upload_url).toContain('X-Amz-Signature');
    expect(result.upload_url).toContain('X-Amz-Algorithm=AWS4-HMAC-SHA256');
    expect(result.expires_in).toBe(3600);
  });

  it('generates valid S3 presigned download URL and rejects path from different tenant', async () => {
    const validPath = `tenants/${TENANT_A}/profiles/${PROFILE_ID}/1700000000.zip`;
    const download = await generateProfileDownloadUrl(mockEnv, TENANT_A, validPath);
    expect(download.download_url).toContain('https://fake-account-12345.r2.cloudflarestorage.com');
    expect(download.download_url).toContain('X-Amz-Signature');

    // Attempting to download tenant B file using tenant A credentials must throw
    const foreignPath = `tenants/${TENANT_B}/profiles/other-profile/1700000000.zip`;
    await expect(
      generateProfileDownloadUrl(mockEnv, TENANT_A, foreignPath)
    ).rejects.toThrow('Access denied');
  });

  it('saves and lists profiles strictly partitioned by tenant in D1', async () => {
    const storagePathA = `tenants/${TENANT_A}/profiles/${PROFILE_ID}/1700000000.zip`;
    await saveProfileRecord(mockD1, TENANT_A, {
      id: PROFILE_ID,
      name: 'Alpha Work Profile',
      storage_path: storagePathA,
      zip_size: 250000000,
      user_agent: 'Mozilla/5.0 Chrome/131.0',
    });

    const storagePathB = `tenants/${TENANT_B}/profiles/beta-profile-01/1700000000.zip`;
    await saveProfileRecord(mockD1, TENANT_B, {
      id: 'beta-profile-01',
      name: 'Beta Profile',
      storage_path: storagePathB,
      zip_size: 150000000,
    });

    // Tenant A query must only return Tenant A's profiles
    const profilesA = await listProfiles(mockD1, TENANT_A);
    expect(profilesA.length).toBe(1);
    expect(profilesA[0].id).toBe(PROFILE_ID);
    expect(profilesA[0].name).toBe('Alpha Work Profile');
    expect(profilesA[0].zip_size).toBe(250000000);

    // Tenant B query must only return Tenant B's profiles
    const profilesB = await listProfiles(mockD1, TENANT_B);
    expect(profilesB.length).toBe(1);
    expect(profilesB[0].id).toBe('beta-profile-01');

    // Querying non-existent profile in Tenant A
    const missing = await getProfile(mockD1, TENANT_A, 'beta-profile-01');
    expect(missing).toBeNull();
  });

  it('manages distributed lease locking to prevent concurrent overwrite', async () => {
    const storagePath = `tenants/${TENANT_A}/profiles/${PROFILE_ID}/1700000000.zip`;
    await saveProfileRecord(mockD1, TENANT_A, {
      id: PROFILE_ID,
      name: 'Alpha Work Profile',
      storage_path: storagePath,
    });

    // 1. Device 1 acquires lease lock for 60 seconds
    const lock1 = await acquireProfileLock(mockD1, TENANT_A, PROFILE_ID, 'device-workstation-win', 60);
    expect(lock1.success).toBe(true);

    const lockedProfile = await getProfile(mockD1, TENANT_A, PROFILE_ID);
    expect(lockedProfile?.locked_by_device_id).toBe('device-workstation-win');
    expect(lockedProfile?.status).toBe('running');

    // 2. Device 2 tries to acquire lock -> must be blocked
    const lock2 = await acquireProfileLock(mockD1, TENANT_A, PROFILE_ID, 'device-vps-linux', 60);
    expect(lock2.success).toBe(false);
    expect(lock2.error).toContain('currently locked by device');

    // 3. Device 1 releases lock
    const release = await releaseProfileLock(mockD1, TENANT_A, PROFILE_ID, 'device-workstation-win');
    expect(release.success).toBe(true);

    const unlockedProfile = await getProfile(mockD1, TENANT_A, PROFILE_ID);
    expect(unlockedProfile?.locked_by_device_id).toBeNull();
    expect(unlockedProfile?.status).toBe('idle');

    // 4. Device 2 can now acquire lock
    const lock3 = await acquireProfileLock(mockD1, TENANT_A, PROFILE_ID, 'device-vps-linux', 60);
    expect(lock3.success).toBe(true);
  });

  it('deletes profile successfully from D1', async () => {
    const storagePath = `tenants/${TENANT_A}/profiles/${PROFILE_ID}/1700000000.zip`;
    await saveProfileRecord(mockD1, TENANT_A, {
      id: PROFILE_ID,
      name: 'Alpha Work Profile',
      storage_path: storagePath,
    });

    const deleted = await deleteProfile(mockD1, TENANT_A, PROFILE_ID);
    expect(deleted).toBe(true);

    const queryAfter = await getProfile(mockD1, TENANT_A, PROFILE_ID);
    expect(queryAfter).toBeNull();
  });
});
