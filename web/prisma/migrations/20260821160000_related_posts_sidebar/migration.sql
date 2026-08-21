-- AlterTable
ALTER TABLE `Post` ADD COLUMN `relatedPostsSourceMode` VARCHAR(191) NULL,
    ADD COLUMN `blogSidebarOverride` VARCHAR(191) NULL;
