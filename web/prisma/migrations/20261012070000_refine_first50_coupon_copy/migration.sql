UPDATE `Coupon`
SET `description` = 'Early access offer — save on your first month. Limited to the first 50 stores. Renews at the regular monthly price after the offer.',
    `updatedAt` = CURRENT_TIMESTAMP(3)
WHERE `code` = 'FIRST50';
