-- Tuquet Multi-Tenant Storage Hub D1 Database Schema
-- Compatible with Cloudflare D1 (SQLite) and Supabase Multi-Tenant Architecture

-- 1. Files & Media Assets Table
CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'default',
    value TEXT,
    metadata TEXT NOT NULL,
    file_name TEXT,
    file_type TEXT,
    file_size TEXT,
    upload_ip TEXT,
    upload_address TEXT,
    list_type TEXT,
    timestamp INTEGER,
    label TEXT,
    directory TEXT DEFAULT '/',
    channel TEXT,
    channel_name TEXT,
    tg_file_id TEXT,
    tg_chat_id TEXT,
    tg_bot_token TEXT,
    is_chunked BOOLEAN DEFAULT FALSE,
    tags TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. Folders Structure
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

-- 3. Browser Profile Snapshots Table (user-data-dir backups)
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

-- 4. Audit & Activity Logs Table
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

-- 5. Tenant & System Settings Table
CREATE TABLE IF NOT EXISTS settings (
    tenant_id TEXT NOT NULL DEFAULT 'global',
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    category TEXT,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (tenant_id, key)
);

-- 6. ImgBed Index Management Compatibility Tables
CREATE TABLE IF NOT EXISTS index_operations (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'default',
    type TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    data TEXT NOT NULL,
    processed BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS index_metadata (
    key TEXT NOT NULL,
    tenant_id TEXT NOT NULL DEFAULT 'default',
    last_updated INTEGER,
    total_count INTEGER DEFAULT 0,
    last_operation_id TEXT,
    chunk_count INTEGER DEFAULT 0,
    chunk_size INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (tenant_id, key)
);

CREATE TABLE IF NOT EXISTS other_data (
    key TEXT NOT NULL,
    tenant_id TEXT NOT NULL DEFAULT 'default',
    value TEXT NOT NULL,
    type TEXT,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (tenant_id, key)
);

-- Indexes for High Performance Multi-Tenant Queries
CREATE INDEX IF NOT EXISTS idx_files_tenant_timestamp ON files(tenant_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_files_tenant_directory ON files(tenant_id, directory);
CREATE INDEX IF NOT EXISTS idx_files_tenant_file_type ON files(tenant_id, file_type);
CREATE INDEX IF NOT EXISTS idx_files_tenant_tags ON files(tenant_id, tags);
CREATE INDEX IF NOT EXISTS idx_files_tenant_created ON files(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_folders_tenant_parent ON folders(tenant_id, parent_path);
CREATE INDEX IF NOT EXISTS idx_folders_tenant_path ON folders(tenant_id, path);

CREATE INDEX IF NOT EXISTS idx_browser_profiles_tenant ON browser_profiles(tenant_id, id);
CREATE INDEX IF NOT EXISTS idx_browser_profiles_status ON browser_profiles(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_browser_profiles_updated ON browser_profiles(tenant_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant ON audit_logs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_settings_tenant_cat ON settings(tenant_id, category);
CREATE INDEX IF NOT EXISTS idx_index_operations_tenant ON index_operations(tenant_id, processed, timestamp);

-- Triggers for Automatic updated_at Timestamps
CREATE TRIGGER IF NOT EXISTS update_files_updated_at 
    AFTER UPDATE ON files
    BEGIN
        UPDATE files SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

CREATE TRIGGER IF NOT EXISTS update_folders_updated_at 
    AFTER UPDATE ON folders
    BEGIN
        UPDATE folders SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

CREATE TRIGGER IF NOT EXISTS update_browser_profiles_updated_at 
    AFTER UPDATE ON browser_profiles
    BEGIN
        UPDATE browser_profiles SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

CREATE TRIGGER IF NOT EXISTS update_settings_updated_at 
    AFTER UPDATE ON settings
    BEGIN
        UPDATE settings SET updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW.tenant_id AND key = NEW.key;
    END;
