# Tuquet Multi-Tenant Storage Hub

> **Dedicated Multi-Tenant Object Storage, Cloudflare D1/R2 Engine & RFC 4918 WebDAV Server for the Tuquet Antidetect Ecosystem.**

[![CI](https://github.com/tuquet/storage/actions/workflows/ci.yml/badge.svg)](https://github.com/tuquet/storage/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## Overview

Tuquet Storage Hub extends and hardens the modern Cloudflare Pages/Functions stack into an enterprise-grade multi-tenant storage subsystem:
- **Multi-Tenant Data Isolation**: D1 SQLite schema with strict `tenant_id` scoping and indexed queries.
- **Antidetect Browser Profile Sync**: Presigned S3/R2 direct streaming for `.tar.zst` and `.zip` archives with atomic conditional SQL lease locking (`WHERE locked_by_device_id IS NULL OR locked_until < now`).
- **RFC 4918 WebDAV Server**: Mountable WebDAV endpoints (`/webdav/*`) isolated to `tenants/{tenant_id}/`.
- **Security Hardened**: Removed all third-party Sentry DSNs and external telemetry pings; fail-closed HMAC-SHA256 JWT & Device Token verification.
- **Upstream Foundation**: Built upon and adapted from [tuquet/storage](https://github.com/tuquet/storage).

---

<div align="center">
    <a href="https://github.com/tuquet/storage"><img width="80%" alt="logo" src="readme/banner.png" /></a>
    <p><em>🗂️ Beyond image hosting: an all-in-one, multi-tenant file management and browser profile hub.</em></p>
</div>

---

> [!IMPORTANT]
>
> **If you encounter issues, please check the [announcements](https://github.com/tuquet/storage/discussions/categories/announcements) and [Telegram channel](https://t.me/tuquet) first. Important notices and breaking changes will be explained in the announcements!**


# 1. 💡 Introduction

CloudFlare ImgBed is a self-hosted image and file hosting solution for Docker and serverless environments, bringing **Telegram**, **Discord**, **Cloudflare R2**, **S3-compatible storage**, **Hugging Face**, **WebDAV**, and more into one management interface. It provides file management, authentication, directory organization, content moderation, a RESTful API, and WebDAV, with a growing range of personalized AI capabilities such as image tag recognition. It is suited to personal image hosting, website asset management, and lightweight file distribution. **[View all features →](https://storage.tuquet.com/)**

![CloudFlare](readme/海报.png)

## 🤝 Partners

<table width="100%">
  <tr>
    <td align="center" width="16.67%">
      <strong><a href="https://www.cloudflare.com/">Cloudflare</a></strong>
    </td>
    <td align="center" width="16.67%">
      <strong><a href="https://edgeone.ai/?from=github">EdgeOne</a></strong>
    </td>
    <td align="center" width="16.67%">
      <strong><a href="https://www.packyapi.ai/register?aff=u0Ka">PackyCode</a></strong>
    </td>
    <td align="center" width="16.67%">
      <strong><a href="https://www.hncloud.com/activity/activity_2026summer.html?k=MarSeventh">HuaNa Cloud</a></strong>
    </td>
    <td align="center" width="16.67%">
      <strong><a href="https://www.svyun.com/recommend/AELZ0UeMz8K11Zg7pEXC">SuWei Cloud</a></strong>
    </td>
    <td align="center" width="16.67%">
      <strong><a href="https://linux.do/t/topic/2578561">Linux DO</a></strong>
    </td>
  </tr>
  <tr>
    <td align="center"><a href="https://www.cloudflare.com/"><img src="readme/partners/cloudflare-logo.png" alt="Cloudflare logo" height="25"></a></td>
    <td align="center"><a href="https://edgeone.ai/?from=github"><picture><source media="(prefers-color-scheme: dark)" srcset="readme/partners/edgeone-logo-dark.png"><img src="readme/partners/edgeone-logo.png" alt="EdgeOne logo" height="25"></picture></a></td>
    <td align="center"><a href="https://www.packyapi.ai/register?aff=u0Ka"><picture><source media="(prefers-color-scheme: dark)" srcset="readme/partners/packycode-logo-dark.png"><img src="readme/partners/packycode-logo.png" alt="PackyCode logo" height="25"></picture></a></td>
    <td align="center"><a href="https://www.hncloud.com/activity/activity_2026summer.html?k=MarSeventh"><picture><source media="(prefers-color-scheme: dark)" srcset="readme/partners/hncloud-logo-dark.png"><img src="readme/partners/hncloud-logo.png" alt="HuaNa Cloud logo" height="25"></picture></a></td>
    <td align="center"><a href="https://www.svyun.com/recommend/AELZ0UeMz8K11Zg7pEXC"><picture><source media="(prefers-color-scheme: dark)" srcset="readme/partners/svyun-logo-dark.png"><img src="readme/partners/svyun-logo.png" alt="SuWei Cloud logo" height="25"></picture></a></td>
    <td align="center"><a href="https://linux.do/t/topic/2578561"><picture><source media="(prefers-color-scheme: dark)" srcset="readme/partners/linuxdo-logo.png"><img src="readme/partners/linuxdo-logo-light.png" alt="Linux DO logo" height="25"></picture></a></td>
  </tr>
  <tr>
    <td align="center"><sub>Provides CDN acceleration and security protection</sub></td>
    <td align="center"><sub>Provides CDN acceleration and security protection</sub></td>
    <td align="center"><sub>Provide premium, stable, and budget-friendly LLM APIs. Generate text, images, and code all in one place. Sign up via our link for free credits and exclusive discounts!</sub></td>
    <td align="center"><sub>Provides stable and high-quality cloud computing resources. Sign up via our link for exclusive discounts!</sub></td>
    <td align="center"><sub>Provides stable and high-quality cloud computing resources. Sign up via our link for exclusive discounts!</sub></td>
    <td align="center"><sub>Provides community support</sub></td>
  </tr>
</table>


# 2. 🖥️ Demo

**Demo Address**: [CloudFlare ImgBed](https://cfbed.1314883.xyz/) · **Access Password**: `cfbed`

![Upload Page](https://storage.tuquet.com/assets/upload.png)

<details>
    <summary>Other page screenshots</summary>

<table>
  <tr>
    <td align="center" width="50%">
      <strong>Login Page</strong><br>
      <img src="https://storage.tuquet.com/assets/login.png" alt="Login Page" width="100%">
    </td>
    <td align="center" width="50%">
      <strong>Upload Progress</strong><br>
      <img src="https://storage.tuquet.com/assets/uploading.png" alt="Upload Progress" width="100%">
    </td>
  </tr>
  <tr>
    <td align="center" width="50%">
      <strong>File Management</strong><br>
      <img src="https://storage.tuquet.com/assets/dashboard.png" alt="File Management" width="100%">
    </td>
    <td align="center" width="50%">
      <strong>User Management</strong><br>
      <img src="https://storage.tuquet.com/assets/customer-config.png" alt="User Management" width="100%">
    </td>
  </tr>
  <tr>
    <td align="center" width="50%">
      <strong>Status Page</strong><br>
      <img src="https://storage.tuquet.com/assets/status-page.png" alt="Status Page" width="100%">
    </td>
    <td align="center" width="50%">
      <strong>Public Gallery</strong><br>
      <img src="https://storage.tuquet.com/assets/public-gallery.png" alt="Public Gallery" width="100%">
    </td>
  </tr>
</table>

</details>

# 3. 📚 Documentation & Updates

## 📖 Documentation

The documentation covers deployment, storage configuration, feature usage, RESTful API integration, WebDAV, version upgrades, and troubleshooting. Whether you are deploying the project for the first time or maintaining an existing instance, you can find the relevant instructions here.

**[Read the full documentation →](https://storage.tuquet.com/en)**

## 📝 Changelog

Follow the latest features, bug fixes, compatibility changes, and upgrade notes.

[![Recent Updates](https://recent-update.cfbed.sanyue.de/en)](https://storage.tuquet.com/)

# 4. 🌱 Ecosystem

An open-source ecosystem grows through community support. Visit the [CloudFlare ImgBed Ecosystem](https://storage.tuquet.com/) page to explore the following resources and more:

- **Plugin Extensions**: Browser extensions, integrations for Typecho, WordPress, and Obsidian, OpenList drivers, and more.
- **Companion Applications**: Desktop clients, bot tools, and more.
- **AI Agent Applications**: Official project skills and related tools.
- **Tutorials and Guides**: High-quality videos and articles from content creators.

Discover useful plugins, applications, and tutorials, or share your own work with the community. See the [Ecosystem Call for Contributions](https://github.com/tuquet/storage/discussions/606) for submission guidelines. We look forward to your participation!

# 5. 💝 Support & Sponsors

## ☕ Support the Project

Maintaining an open source project takes time and effort. If CloudFlare ImgBed has helped you, consider supporting its continued development.

<p align="center">
  <a href="https://afdian.com/a/marseventh"><img src="https://img.shields.io/badge/AFDIAN-946CE6?style=for-the-badge&logo=afdian&logoColor=white" height="36" alt="Support via Afdian"></a>
  &nbsp;&nbsp;
  <a href="readme/weixin-reward.png"><img src="https://img.shields.io/badge/WeChat_Pay-07C160?style=for-the-badge&logo=wechat&logoColor=white" height="36" alt="Support via WeChat Pay"></a>
</p>

## 💖 Sponsors

Thank you to every sponsor who supports this project! Your support helps sustain ongoing maintenance and drives the continued improvement of CloudFlare ImgBed.

[![Sponsors](https://afdian-sponsors.sanyue.de/image?columns=12)](https://afdian.com/a/marseventh)

# 6. 👥 Community

## 🧑‍💻 Contributors

Thank you to everyone who has contributed code, documentation, ideas, and feedback!

[![Contributors](https://contrib.rocks/image?repo=Marseventh/Cloudflare-ImgBed)](https://github.com/tuquet/storage/graphs/contributors)

## ⭐ Star History

**If you find the project useful, please consider giving it a Star ⭐. Thank you for your support!**

<a href="https://github.com/tuquet/storage">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://marseventh.github.io/CloudFlare-ImgBed/star-history-dark.svg" />
   <source media="(prefers-color-scheme: light)" srcset="https://marseventh.github.io/CloudFlare-ImgBed/star-history-light.svg" />
   <img alt="Star-History" src="https://marseventh.github.io/CloudFlare-ImgBed/star-history-light.svg" />
 </picture>
</a>

# 7. ⚖️ License & Related Projects

## 📄 License

> [!IMPORTANT]
> This project is licensed under the [MIT License](LICENSE). You may use, modify, and distribute it, provided that the original copyright and license notices are retained in all copies or substantial portions of the software.

## 🔗 Related Open Source Projects

- **Web frontend**: [MarSeventh/Sanyue-ImgHub](https://github.com/tuquet/storage)
- **Desktop client**: [MarSeventh/satellite](https://github.com/tuquet/satellite)
- **Upstream project**: [cf-pages/Telegraph-Image](https://github.com/cf-pages/Telegraph-Image)

CloudFlare ImgBed evolved from Telegraph-Image. Thanks to its original authors and contributors.
