
docker exec -it arty-local \
psql -U postgres -d Arty -c ' \
CREATE TABLE wishlist ( \
    id SERIAL PRIMARY KEY, \
    item_code TEXT NOT NULL, \
    quantity INT NOT NULL, \
    character TEXT NOT NULL, \
    executing BOOLEAN, \
    fulfilled BOOLEAN, \
    executing_by TEXT, \
    acquisition_method TEXT, \
    min_level INT, \
    max_level INT, \
    cost INT, \
    currency TEXT, \
    claimed_at TIMESTAMPTZ, \
    created_at TIMESTAMPTZ DEFAULT NOW(), \
    expiration_date TIMESTAMPTZ, \
    job_id TEXT, \

    CONSTRAINT chk_level_range CHECK (min_level <= max_level) \
);'