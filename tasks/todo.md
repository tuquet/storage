# Task List: Tuquet Multi-Tenant Storage Hub

## Phase 1: Workspace Ingestion & Multi-Tenant Foundations

- [x] Task 1: Ingest & Standardize CloudFlare-ImgBed into `storage/`
  - Description: Tải mã nguồn `MarSeventh/CloudFlare-ImgBed` về `storage/`, loại bỏ `package-lock.json`, cấu hình `package.json` chuẩn `pnpm` và khai báo trong `pnpm-workspace.yaml`.
  - Acceptance: Thư mục `storage/` tồn tại, chạy được `pnpm install` sạch sẽ mà không sinh lockfile npm/yarn thừa.
  - Verify: Chạy `pnpm install` và `pnpm --filter tuquet-storage test` hoặc `pnpm exec wrangler --version`.
  - Files: `storage/package.json`, `pnpm-workspace.yaml`, `storage/wrangler.toml`
  - Dependencies: None
  - Scope: S (2-3 files)

- [x] Task 2: Multi-Tenant Schema Design for D1 / SQLite
  - Description: Xây dựng schema D1 bao gồm cột `tenant_id` trên mọi bảng (`files`, `folders`, `browser_profiles`, `audit_logs`), tạo indexes tối ưu tìm kiếm theo tenant.
  - Acceptance: Schema SQL khởi tạo thành công trên Cloudflare D1 local (`wrangler d1 execute --local`).
  - Verify: Chạy lệnh `pnpm exec wrangler d1 execute METADATA_D1 --local --file=database/schema.sql`.
  - Files: `storage/database/schema.sql`, `storage/database/migrations/0001_multi_tenant.sql`
  - Dependencies: Task 1
  - Scope: S (2 files)

- [x] Task 3: Edge Multi-Tenant Authentication Middleware
  - Description: Xây dựng middleware trong Pages Functions (`functions/_middleware.ts`) xác thực Supabase JWT hoặc Device Token từ header, giải mã và gắn `tenant_id` an toàn vào request context.
  - Acceptance: Mọi request vào `/api/*` không có token hợp lệ bị chặn 401 Unauthorized; request có token hợp lệ được gắn `context.data.tenantId`.
  - Verify: Unit test với Vitest mock JWT và kiểm tra response 200/401.
  - Files: `storage/functions/_middleware.ts`, `storage/functions/utils/auth.ts`, `storage/tests/auth.test.ts`
  - Dependencies: Task 2
  - Scope: M (3 files)

## Checkpoint 1: Foundation Checkpoint
- [x] Dependencies cài đặt hoàn tất qua `pnpm install`.
- [x] Local D1 và Cloudflare Functions Middleware nhận diện đúng `tenant_id`.

---

## Phase 2: Browser Profile Storage Slice (`user-data-dir`)

- [x] Task 4: Presigned URL API for Large Browser Profile Snapshots
  - Description: Xây dựng API `/api/profiles/upload-url` và `/api/profiles/download-url` tạo Presigned S3/R2 URL với prefix `tenants/{tenant_id}/profiles/{profile_id}/{timestamp}.zip` để client upload trực tiếp. Cập nhật metadata profile vào D1.
  - Acceptance: Sinh được presigned URL hợp lệ cho R2, ghi nhận metadata profile (browser ID, size, UA) vào D1 sau khi upload hoàn tất.
  - Verify: Test curl PUT file zip mẫu lên Presigned URL và query kiểm tra D1.
  - Files: `storage/functions/api/profiles/upload-url.ts`, `storage/functions/api/profiles/complete.ts`, `storage/functions/api/profiles/[id]/download-url.ts`, `storage/functions/utils/profiles.ts`, `storage/tests/profiles.test.ts`
  - Dependencies: Task 3
  - Scope: M (3 files)

- [x] Task 5: Specter CLI Browser Push & Pull Commands
  - Description: Tích hợp lệnh `specter profile push <profile_id>` và `specter profile pull <profile_id>` trong Rust CLI, tự động nén `user-data-dir`, sanitize cache, gọi presigned API và stream upload/download R2.
  - Acceptance: Lệnh `specter profile push` nén và đẩy profile lên R2; lệnh `specter profile pull` tải về và bung vào đúng thư mục profile máy trạm.
  - Verify: `cargo test -p specter`, kiểm tra `specter profile --help` và `specter profile cloud --help`.
  - Files: `cli/src/commands/browser.rs`, `cli/src/cli.rs`
  - Dependencies: Task 4
  - Scope: M (3 files)

## Checkpoint 2: Browser Profile Sync Checkpoint
- [x] Upload và download trọn vẹn 1 profile trình duyệt zip giữa máy trạm và Cloudflare R2 với đầy đủ `tenant_id`.

---

## Phase 3: Specter Documents & WebDAV Slice

- [x] Task 6: Multi-Tenant Documents & Screenshots Management API
  - Description: Cung cấp API quản lý tài liệu, ảnh chụp màn hình Specter (upload, browse, rename, delete) có hỗ trợ phân loại thư mục và tags dưới `tenants/{tenant_id}/docs/`.
  - Acceptance: API trả về đúng danh sách tệp thuộc tenant của người gọi; hỗ trợ xem trước ảnh (image thumbnail/lightbox) và download.
  - Verify: Chạy test suites Vitest kiểm tra CRUD file API.
  - Files: `storage/functions/api/files/[action].ts`, `storage/functions/utils/r2.ts`
  - Dependencies: Task 3
  - Scope: M (3 files)

- [x] Task 7: Multi-Tenant WebDAV RFC 4918 Handler
  - Description: Xây dựng WebDAV server tại `/webdav/*` hỗ trợ các method PROPFIND, GET, PUT, MKCOL, DELETE, tự động cô lập root directory vào `tenants/{tenant_id}/`.
  - Acceptance: Người dùng có thể kết nối WebDAV client (rclone, Windows Network Drive) với credentials của tenant và chỉ nhìn thấy tệp của chính mình.
  - Verify: Chạy kịch bản test WebDAV PROPFIND bằng curl hoặc tool WebDAV probe.
  - Files: `storage/functions/api/webdav/[[path]].ts`, `storage/tests/webdav.test.ts`
  - Dependencies: Task 6
  - Scope: M (2-3 files)

## Checkpoint 3: Documents & WebDAV Checkpoint
- [x] Quản lý tài liệu và kết nối WebDAV hoạt động chính xác trong phạm vi tenant.

---

## Phase 4: Web UI Multi-Tenant & End-to-End Verification

- [x] Task 8: Web UI Multi-Tenant & Tab Customization
  - Description: Tùy biến giao diện Vue 3 của CloudFlare-ImgBed: thêm tenant switcher/header, Tab 1 dành cho "Browser Profiles" (quản lý bản sao lưu `user-data-dir`), Tab 2 dành cho "Documents & Screenshots" (gallery, preview).
  - Acceptance: Giao diện hiển thị rõ ràng thông tin tenant hiện tại, chuyển đổi mượt mà giữa Profiles và Documents.
  - Verify: Chạy `pnpm dev` trong `storage/web` và kiểm tra giao diện trên trình duyệt.
  - Files: `storage/web/src/views/ProfilesView.vue`, `storage/web/src/views/DriveView.vue`, `storage/web/src/App.vue`
  - Dependencies: Task 4, Task 6
  - Scope: M (4 files)

- [x] Task 9: Build Static Assets & System Integration Verification
  - Description: Build toàn bộ frontend sang `storage/frontend-dist`, kiểm thử end-to-end từ CLI đến Web UI với kịch bản Supabase Multi-Tenant hoàn chỉnh.
  - Acceptance: Giao diện `storage/frontend-dist/hub.html` sẵn sàng deploy cùng Pages, toàn bộ test suite pass.
  - Verify: Chạy `pnpm test` (19/19 tests) và `cargo test -p specter` (94/94 tests).
  - Files: `storage/package.json`, `storage/tasks/todo.md`
  - Dependencies: Task 8
  - Scope: S (2 files)

## Checkpoint 4: Foundation & Feature Verification
- [x] Tất cả 9 task nền tảng hoàn thành, 100% tiêu chí nghiệm thu đạt yêu cầu.

---

## Phase 5: Blind Spot Hardening & Security Audit Remediation

- [x] Task 10: Third-Party Telemetry & Sentry DSN Neutralization
  - Description: Gỡ bỏ toàn bộ hardcoded Sentry DSN (`o4507644548022272`) và request ra bên ngoài tới `frozen-sentinel.pages.dev` trong `functions/utils/middleware.js`. Middleware error handling chuyển sang native try/catch an toàn.
  - Acceptance: Không có bất kỳ kết nối telemetry bên ngoài nào được phát sinh khi gọi Pages Functions.
  - Files: `storage/functions/utils/middleware.js`

- [x] Task 11: Fail-Closed JWT & Device Token Authentication
  - Description: Khắc phục lỗ hổng fail-open trong `functions/utils/auth.ts`: bắt buộc phải có `SUPABASE_JWT_SECRET` để xác thực chữ ký HMAC-SHA256, từ chối unverified tokens. Kiểm tra xác thực Device Token so với `DEVICE_TOKEN_SECRET`.
  - Acceptance: Request mang JWT giả mạo hoặc khi server chưa cấu hình secret bị từ chối 401 Unauthorized ngay lập tức.
  - Files: `storage/functions/utils/auth.ts`, `storage/tests/auth.test.ts`

- [x] Task 12: WebDAV Credential Hardening
  - Description: Nâng cấp Basic Auth trong `functions/webdav/[[path]].ts` để đối chiếu password với `WEBDAV_PASSWORD`, `MASTER_API_KEY`, `DEVICE_TOKEN_SECRET` hoặc token Supabase JWT thay vì chấp nhận mọi chuỗi.
  - Acceptance: WebDAV client sai mật khẩu bị trả 401 Unauthorized; chỉ tài khoản hợp lệ mới mount được thư mục tenant.
  - Files: `storage/functions/webdav/[[path]].ts`, `storage/tests/webdav.test.ts`

- [x] Task 13: Atomic Conditional SQL Lease Locking (TOCTOU Prevention)
  - Description: Chuyển đổi `acquireProfileLock` và `releaseProfileLock` từ cơ chế 2 bước (read then update) sang câu lệnh SQL UPDATE có điều kiện nguyên tử (`WHERE locked_by_device_id IS NULL OR locked_by_device_id = ? OR locked_until < ?`).
  - Acceptance: Ngăn chặn triệt để xung đột ghi đè giữa 2 máy trạm/node cùng mount hoặc sync profile.
  - Files: `storage/functions/utils/profiles.ts`, `storage/tests/profiles.test.ts`

- [x] Task 14: Cloudflare R2 Object Verification on Profile Complete
  - Description: Tại `/api/profiles/complete`, kiểm tra sự tồn tại thực tế và kích thước byte chính xác của archive trên R2 (`r2.head` / `HeadObjectCommand`) trước khi lưu record vào D1.
  - Acceptance: Không thể đăng ký profile ảo khi client chưa thực sự stream file lên R2.
  - Files: `storage/functions/api/profiles/complete.ts`

- [x] Task 15: Profile Archive Format Harmonization (`tar.zst` & `zip`)
  - Description: Thống nhất định dạng lưu trữ giữa Specter CLI (`.tar.zst`) và Storage Hub, hỗ trợ tùy chọn `format` (mặc định `tar.zst`, tương thích ngược `zip`) trong `buildProfileStoragePath`, `generateProfileUploadUrl` và CLI `handle_profile_push`.
  - Acceptance: CLI đẩy và kéo `.tar.zst` đồng bộ hoàn toàn với metadata D1 và R2 key.
  - Files: `storage/functions/utils/profiles.ts`, `storage/functions/api/profiles/upload-url.ts`, `cli/src/commands/browser.rs`, `storage/tests/profiles.test.ts`

## Checkpoint 5: Hardened Production Ready
- [x] Đã xử lý triệt để 6/6 điểm mù chất lượng và bảo mật.
- [x] 22/22 Vitest tests pass 100% trong `storage/`.
- [x] 94/94 Rust tests pass 100% trong `cli/`.

