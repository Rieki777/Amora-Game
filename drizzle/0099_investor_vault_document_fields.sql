-- The investor vault has never saved a document, in any version.
--
-- `POST /api/admin/investor-docs/upload` built `{id, name, filename, pageLink,
-- uploadedAt}` and handed it to a repo whose columns are `{id, title,
-- description, url, requires_request, sort_order}`. `title` is NOT NULL and the
-- payload never set it, so every attempt threw `Column 'title' cannot be null`.
-- The file was already on the uploads volume by then, so each press of the
-- button also left an orphan nothing referenced.
--
-- A document's name maps onto `title` and its stored file onto `url`. Two of
-- the fields the admin form already collects had no column at all, so they get
-- one here. Both are nullable: rows loaded by scripts/import-json-to-mysql.ts
-- carry neither, and an imported row pointing at an external `url` stays valid.
ALTER TABLE `investor_docs` ADD COLUMN `page_link` varchar(1000) NULL;
ALTER TABLE `investor_docs` ADD COLUMN `uploaded_at` timestamp NULL DEFAULT NULL;
