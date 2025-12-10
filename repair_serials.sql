-- Force update NULL serial numbers
DO $$
DECLARE
    r RECORD;
    counter INTEGER;
    current_item_id UUID;
BEGIN
    current_item_id := NULL;
    counter := 0;
    
    -- Iterate through all user_items, ordered by item_id and creation date
    FOR r IN SELECT id, item_id, serial_number FROM user_items ORDER BY item_id, created_at ASC LOOP
        
        -- Reset counter for new item type
        IF r.item_id IS DISTINCT FROM current_item_id THEN
            current_item_id := r.item_id;
            counter := 0; -- Will increment to 1 immediately
        END IF;
        
        counter := counter + 1;
        
        -- Update if serial is wrong or null (simple approach: just update all to be safe, or only nulls)
        -- To be safe and fix "holes" or duplicates, let's update ALL.
        -- This ensures Serial #1 is the oldest, #2 is next, etc.
        UPDATE user_items SET serial_number = counter WHERE id = r.id;
        
    END LOOP;
END $$;
