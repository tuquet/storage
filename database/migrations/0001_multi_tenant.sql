-- Migration 0001_multi_tenant: Add multi-tenant support and browser profile tables

-- 1. Add tenant_id to files if migrating existing D1
-- Note: In SQLite, adding a column with DEFAULT is supported
ALTER TABLE files ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default';

-- 2. Folders table
CREATE TABLE IF NOT EXISTS folders (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'default',
    name TEXT NOT NULL,
    parent_path TEXT DEFAULT '/',
    path TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, path)
);

-- 3. Browser profiles table
CREATE TABLE IF NOT EXISTS browser_profiles (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    name TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    zip_size INTEGER NOT NULL DEFAULT 0,
    user_agent TEXT,
    browser_version TEXT,
    locked_by_device_id TEXT,
    locked_until INTEGER,
    status TEXT DEFAULT 'idle',
    checksum_sha256 TEXT,
    metadata TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 4. Audit logs table
CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id TEXT NOT NULL,
    device_id TEXT,
    ip_address TEXT,
    details TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 5. Indexes
CREATE INDEX IF NOT EXISTS idx_files_tenant_timestamp ON files(tenant_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_files_tenant_directory ON files(tenant_id, directory);
CREATE INDEX IF NOT EXISTS idx_files_tenant_file_type ON files(tenant_id, file_type);
CREATE INDEX IF NOT EXISTS idx_files_tenant_tags ON files(tenant_id, tags);

CREATE INDEX IF NOT EXISTS idx_folders_tenant_parent ON folders(tenant_id, parent_path);
CREATE INDEX IF NOT EXISTS idx_folders_tenant_path ON folders(tenant_id, path);

CREATE INDEX IF NOT EXISTS idx_browser_profiles_tenant ON browser_profiles(tenant_id, id);
CREATE INDEX IF NOT EXISTS idx_browser_profiles_status ON browser_profiles(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_browser_profiles_updated ON browser_profiles(tenant_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant ON audit_logs(tenant_id, created_at DESC);
