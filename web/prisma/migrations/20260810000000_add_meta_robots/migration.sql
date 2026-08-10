-- AlterTable
ALTER TABLE `Post` ADD COLUMN `metaRobotsNoindex` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `metaRobotsNofollow` BOOLEAN NOT NULL DEFAULT false;
